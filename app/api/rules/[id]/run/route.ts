/**
 * POST /api/rules/[id]/run
 *
 * Manually run a single rule against all matching inbox threads.
 * Unlike "test" (dry-run), this actually executes the rule's actions.
 *
 * Scans up to 200 non-archived, non-deleted threads and runs the rule's
 * conditions + actions against each. Returns how many matched and acted on.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import { evaluateConditions, type Condition, type ThreadData } from "@/lib/rules/conditions";
import { executeAction, type Action } from "@/lib/rules/actions";

type Ctx = { params: Promise<{ id: string }> };

async function buildThreadData(
  thread: {
    id: string;
    user_id: string;
    subject: string | null;
    sender_email: string | null;
    ai_category: string | null;
    ai_priority: string | null;
    ai_intent: string | null;
    primary_account_id: string | null;
  },
): Promise<ThreadData> {
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

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the rule and verify ownership
  const { data: ruleRow } = await supabase
    .from("rules")
    .select("id, name, conditions, actions, enabled")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ruleRow) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const conditions: Condition[] = Array.isArray(ruleRow.conditions)
    ? (ruleRow.conditions as Condition[])
    : [];
  const actions: Action[] = Array.isArray(ruleRow.actions)
    ? (ruleRow.actions as Action[])
    : [];

  if (actions.length === 0) {
    return NextResponse.json({ error: "Rule has no actions configured" }, { status: 400 });
  }

  // Fetch inbox threads (non-archived, non-deleted)
  const { data: threads, error: threadErr } = await supabase
    .from("threads")
    .select(
      "id, user_id, subject, sender_email, sender_name, ai_category, ai_priority, ai_intent, primary_account_id",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  let matched = 0;
  let acted = 0;
  const errors: string[] = [];

  for (const t of threads ?? []) {
    const thread = t as {
      id: string;
      user_id: string;
      subject: string | null;
      sender_email: string | null;
      ai_category: string | null;
      ai_priority: string | null;
      ai_intent: string | null;
      primary_account_id: string | null;
    };

    let threadData: ThreadData;
    try {
      threadData = await buildThreadData(thread);
    } catch {
      continue;
    }

    if (!evaluateConditions(conditions, threadData)) continue;

    matched++;

    // Execute all actions
    let actionSuccess = true;
    for (const action of actions) {
      try {
        await executeAction(action, thread.id, user.id);
      } catch (e) {
        actionSuccess = false;
        errors.push(
          `Thread "${thread.subject ?? thread.id}": ${e instanceof Error ? e.message : "action failed"}`,
        );
      }
    }
    if (actionSuccess) acted++;
  }

  // Update match stats
  const admin = createAdminClient();
  if (matched > 0) {
    try {
      const { data: current } = await admin
        .from("rules")
        .select("match_count")
        .eq("id", id)
        .maybeSingle();
      const currentCount = typeof current?.match_count === "number" ? current.match_count : 0;
      await admin
        .from("rules")
        .update({
          match_count: currentCount + matched,
          last_matched_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({
    ruleName: ruleRow.name as string,
    totalScanned: (threads ?? []).length,
    matched,
    acted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
