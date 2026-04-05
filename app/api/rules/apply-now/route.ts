/**
 * POST /api/rules/apply-now
 *
 * Immediately runs a single rule against ALL active (non-archived) threads for
 * the authenticated user. This is used when a user creates a quick rule from a
 * thread and wants it to retroactively clean up existing emails.
 *
 * Unlike the normal rules pipeline (which only processes newly-synced threads),
 * this endpoint ignores `rules_processed_at` and evaluates every active thread.
 *
 * Body: { ruleId: string }
 * Response: { applied: number, total: number }
 *
 * Limits: 500 threads max to prevent request timeout.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import { evaluateConditions, type Condition, type ThreadData } from "@/lib/rules/conditions";
import { executeAction, type Action } from "@/lib/rules/actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THREAD_BATCH_LIMIT = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleRow {
  id: string;
  user_id: string;
  conditions: Condition[];
  actions: Action[];
  enabled: boolean;
}

interface ThreadRow {
  id: string;
  user_id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_intent: string | null;
  primary_account_id: string | null;
}

// ---------------------------------------------------------------------------
// Thread data builder
// ---------------------------------------------------------------------------

/**
 * Build the ThreadData shape required by the condition evaluator for a single
 * thread row. Fetches the earliest message to determine body text, attachment
 * presence, and first-time sender status.
 *
 * Mirrors the pattern in `lib/rules/engine.ts` (loadThreadData) and
 * `app/api/rules/[id]/test/route.ts` (buildThreadData).
 */
async function buildThreadData(thread: ThreadRow): Promise<ThreadData> {
  const admin = createAdminClient();

  const senderDomain = thread.sender_email
    ? (thread.sender_email.split("@")[1] ?? null)
    : null;

  // Fetch body and attachment data from the earliest message (thread originator)
  const { data: firstMessage } = await admin
    .from("messages")
    .select("body_text, body_html, attachments")
    .eq("thread_id", thread.id)
    .order("message_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const bodyText =
    (firstMessage?.body_text as string | null) ??
    (firstMessage?.body_html
      ? stripHtml(firstMessage.body_html as string).slice(0, 2000)
      : null);

  const attachments = (firstMessage?.attachments as unknown[]) ?? [];
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  // Determine first-time sender: no other thread from the same sender email exists
  let isFirstTimeSender = false;
  if (thread.sender_email) {
    const { count } = await admin
      .from("threads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", thread.user_id)
      .eq("sender_email", thread.sender_email)
      .neq("id", thread.id);

    isFirstTimeSender = (count ?? 0) === 0;
  }

  return {
    senderEmail: thread.sender_email,
    senderDomain,
    subject: thread.subject,
    body: bodyText,
    aiCategory: thread.ai_category,
    aiPriority: thread.ai_priority,
    aiIntent: thread.ai_intent,
    hasAttachments,
    isFirstTimeSender,
    accountId: thread.primary_account_id,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // --- Auth check ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse and validate request body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const ruleId = typeof b.ruleId === "string" ? b.ruleId.trim() : "";
  if (!ruleId) {
    return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
  }

  // --- Fetch the rule and verify ownership ---
  // Use createClient() (RLS-scoped) so we only ever see rules belonging to this user.
  const { data: ruleData, error: ruleErr } = await supabase
    .from("rules")
    .select("id, user_id, conditions, actions, enabled")
    .eq("id", ruleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ruleErr) {
    return NextResponse.json({ error: ruleErr.message }, { status: 500 });
  }
  if (!ruleData) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const rule = ruleData as RuleRow;
  const conditions: Condition[] = Array.isArray(rule.conditions)
    ? (rule.conditions as Condition[])
    : [];
  const actions: Action[] = Array.isArray(rule.actions)
    ? (rule.actions as Action[])
    : [];

  if (actions.length === 0) {
    return NextResponse.json({ error: "Rule has no actions configured" }, { status: 400 });
  }

  // --- Fetch all active threads for this user ---
  // "Active" means archived_at IS NULL. We fetch up to THREAD_BATCH_LIMIT rows,
  // ordered most-recent first so the user sees recent emails cleaned up first if
  // the batch is large enough to hit the limit.
  const admin = createAdminClient();

  const { data: threads, error: threadErr } = await admin
    .from("threads")
    .select(
      "id, user_id, subject, sender_email, sender_name, ai_category, ai_priority, ai_intent, primary_account_id",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(THREAD_BATCH_LIMIT);

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  const threadList = (threads ?? []) as ThreadRow[];
  const total = threadList.length;

  // --- Evaluate conditions and execute actions ---
  let applied = 0;

  for (const thread of threadList) {
    // Build the ThreadData shape; skip this thread if data loading fails
    let threadData: ThreadData;
    try {
      threadData = await buildThreadData(thread);
    } catch (e) {
      console.error(
        `rules/apply-now: failed to build thread data for thread ${thread.id}:`,
        e,
      );
      continue;
    }

    const matched = evaluateConditions(conditions, threadData);
    if (!matched) continue;

    // Execute every action defined on the rule. Each action is individually
    // wrapped so a failure on one does not abort the remaining actions or
    // the overall batch.
    let anyActionSucceeded = false;
    for (const action of actions) {
      try {
        await executeAction(action, thread.id, user.id);
        anyActionSucceeded = true;
      } catch (e) {
        console.error(
          `rules/apply-now: action "${action.type}" failed for thread ${thread.id} (rule ${rule.id}):`,
          e,
        );
      }
    }

    if (anyActionSucceeded) {
      applied++;
    }
  }

  return NextResponse.json({ applied, total });
}
