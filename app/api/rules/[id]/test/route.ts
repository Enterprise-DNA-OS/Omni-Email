/**
 * POST /api/rules/[id]/test
 *
 * Dry-run a rule against the user's recent threads to show how many would match
 * and a sample of the matching thread subjects/senders.
 *
 * Does NOT execute any actions — read-only evaluation.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import { evaluateConditions, type Condition, type ThreadData } from "@/lib/rules/conditions";

type Ctx = { params: Promise<{ id: string }> };

interface ThreadSample {
  id: string;
  subject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  lastMessageAt: string | null;
}

// ---------------------------------------------------------------------------
// Thread data builder (mirrors engine.ts but without DB writes)
// ---------------------------------------------------------------------------

async function buildThreadData(thread: {
  id: string;
  user_id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_intent: string | null;
  primary_account_id: string | null;
}): Promise<ThreadData> {
  const admin = createAdminClient();
  const senderDomain = thread.sender_email
    ? (thread.sender_email.split("@")[1] ?? null)
    : null;

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

  const { count } = await admin
    .from("threads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", thread.user_id)
    .eq("sender_email", thread.sender_email ?? "")
    .neq("id", thread.id);
  const isFirstTimeSender = (count ?? 0) === 0;

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

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept optional overrides for conditions from request body (for previewing unsaved edits)
  let conditionOverride: Condition[] | null = null;
  try {
    const body = (await request.json()) as { conditions?: unknown } | null;
    if (body && Array.isArray(body.conditions)) {
      conditionOverride = body.conditions as Condition[];
    }
  } catch {
    // Body is optional — if absent or invalid JSON, use the stored rule conditions
  }

  // Verify rule ownership and fetch conditions
  const { data: ruleRow } = await supabase
    .from("rules")
    .select("id, conditions")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ruleRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conditions: Condition[] = conditionOverride ??
    (Array.isArray(ruleRow.conditions) ? (ruleRow.conditions as Condition[]) : []);

  // Fetch up to 100 recent non-archived threads to test against
  const { data: threads, error: threadErr } = await supabase
    .from("threads")
    .select(
      "id, user_id, subject, sender_email, sender_name, ai_category, ai_priority, ai_intent, primary_account_id, last_message_at",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  const matchingSamples: ThreadSample[] = [];
  let matchCount = 0;

  for (const t of threads ?? []) {
    const thread = t as {
      id: string;
      user_id: string;
      subject: string | null;
      sender_email: string | null;
      sender_name: string | null;
      ai_category: string | null;
      ai_priority: string | null;
      ai_intent: string | null;
      primary_account_id: string | null;
      last_message_at: string | null;
    };

    let threadData: ThreadData;
    try {
      threadData = await buildThreadData(thread);
    } catch {
      continue;
    }

    const matched = evaluateConditions(conditions, threadData);
    if (!matched) continue;

    matchCount++;

    // Collect up to 5 sample threads for the response
    if (matchingSamples.length < 5) {
      matchingSamples.push({
        id: thread.id,
        subject: thread.subject,
        senderEmail: thread.sender_email,
        senderName: thread.sender_name,
        lastMessageAt: thread.last_message_at,
      });
    }
  }

  return NextResponse.json({
    matchCount,
    totalTested: (threads ?? []).length,
    samples: matchingSamples,
  });
}
