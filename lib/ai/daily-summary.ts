/**
 * Daily executive summary — Feature 5.1
 *
 * Aggregates inbox state (unread threads, pending tasks, today's calendar
 * events, audit stats) and generates a concise executive narrative via AI.
 * The result is upserted into the daily_summaries table.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface SummaryContent {
  narrative: string;
  urgentThreadCount: number;
  awaitingReplyCount: number;
  pendingTaskCount: number;
  overdueTaskCount: number;
  todayEventCount: number;
  autoArchivedCount: number;
  pendingApprovalCount: number;
  generatedAt: string;
}

interface ThreadRow {
  id: string;
  subject: string | null;
  ai_priority: string | null;
  ai_intent: string | null;
  sender_name: string | null;
}

interface TaskRow {
  id: string;
  description: string;
  deadline: string | null;
}

interface EventRow {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface AuditStat {
  action: string;
  count: number;
}

/**
 * Call the ai-daily-summary edge function for narrative generation.
 */
async function callDailySummaryEdgeFunction(
  context: Record<string, unknown>,
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-daily-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ context }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-daily-summary error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { narrative?: string };
  return data.narrative ?? "";
}

/**
 * Generate (or regenerate) the daily executive summary for a user.
 * Defaults to today's date in the user's UTC day.
 * Upserts the result into daily_summaries.
 */
export async function generateDailySummary(
  userId: string,
  date?: string,
): Promise<SummaryContent> {
  const admin = createAdminClient();

  const summaryDate = date ?? new Date().toISOString().slice(0, 10);

  // --- 1. Urgent unread threads ---
  const { data: urgentThreads } = await admin
    .from("threads")
    .select("id, subject, ai_priority, ai_intent, sender_name")
    .eq("user_id", userId)
    .is("archived_at", null)
    .in("ai_priority", ["urgent", "high"])
    .order("last_message_at", { ascending: false })
    .limit(10);

  const urgentRows = (urgentThreads ?? []) as ThreadRow[];

  // --- 2. Threads awaiting reply (intent = reply or reply_urgent, no active draft) ---
  const { data: draftedThreadIds } = await admin
    .from("drafts")
    .select("thread_id")
    .eq("user_id", userId)
    .in("status", ["draft", "sent"]);

  const draftedIds = new Set(
    (draftedThreadIds ?? []).map((r) => r.thread_id as string),
  );

  const { data: awaitingReplyThreads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .in("ai_intent", ["reply", "reply_urgent"])
    .order("last_message_at", { ascending: false })
    .limit(50);

  const awaitingReplyCount = (awaitingReplyThreads ?? []).filter(
    (t) => !draftedIds.has(t.id as string),
  ).length;

  // --- 3. Pending tasks ---
  const now = new Date().toISOString();

  const { data: pendingTasks } = await admin
    .from("tasks")
    .select("id, description, deadline")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(20);

  const pendingRows = (pendingTasks ?? []) as TaskRow[];
  const overdueRows = pendingRows.filter(
    (t) => t.deadline !== null && t.deadline < now,
  );

  // --- 4. Today's calendar events ---
  const todayStart = new Date(summaryDate + "T00:00:00Z").toISOString();
  const todayEnd = new Date(summaryDate + "T23:59:59Z").toISOString();

  const { data: userAccounts } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  const accountIds = (userAccounts ?? []).map((a) => a.id as string);

  let todayEvents: EventRow[] = [];
  if (accountIds.length > 0) {
    const { data: cals } = await admin
      .from("calendars")
      .select("id")
      .in("account_id", accountIds);

    const calIds = (cals ?? []).map((c) => c.id as string);

    if (calIds.length > 0) {
      const { data: events } = await admin
        .from("events")
        .select("id, title, start_time, end_time")
        .in("calendar_id", calIds)
        .gte("start_time", todayStart)
        .lte("start_time", todayEnd)
        .order("start_time", { ascending: true });

      todayEvents = (events ?? []) as EventRow[];
    }
  }

  // --- 5. Audit stats: auto-archived count in last 24h ---
  const since24h = new Date(Date.now() - 86400_000).toISOString();
  const { data: auditRows } = await admin
    .from("audit_log")
    .select("action")
    .eq("user_id", userId)
    .eq("actor", "system")
    .gte("created_at", since24h);

  const auditStats: Record<string, number> = {};
  for (const row of auditRows ?? []) {
    const action = (row.action as string) ?? "unknown";
    auditStats[action] = (auditStats[action] ?? 0) + 1;
  }
  const autoArchivedCount =
    (auditStats["thread.archive"] ?? 0) +
    (auditStats["thread.auto_archive"] ?? 0);

  // --- 6. Pending approvals ---
  const { count: pendingApprovalCount } = await admin
    .from("approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  // --- Build context for AI ---
  const auditStatsList: AuditStat[] = Object.entries(auditStats).map(
    ([action, count]) => ({ action, count }),
  );

  const context = {
    summaryDate,
    urgentThreads: urgentRows.map((t) => ({
      subject: t.subject ?? "(no subject)",
      senderName: t.sender_name ?? "Unknown",
      priority: t.ai_priority,
      intent: t.ai_intent,
    })),
    awaitingReplyCount,
    pendingTasks: pendingRows.slice(0, 10).map((t) => ({
      description: t.description,
      deadline: t.deadline,
      overdue: t.deadline !== null && t.deadline < now,
    })),
    overdueTaskCount: overdueRows.length,
    todayEvents: todayEvents.map((e) => ({
      title: e.title ?? "(untitled)",
      startTime: e.start_time,
      endTime: e.end_time,
    })),
    autoArchivedCount,
    pendingApprovalCount: pendingApprovalCount ?? 0,
    auditStats: auditStatsList,
  };

  const narrative = await callDailySummaryEdgeFunction(context);

  const content: SummaryContent = {
    narrative,
    urgentThreadCount: urgentRows.length,
    awaitingReplyCount,
    pendingTaskCount: pendingRows.length,
    overdueTaskCount: overdueRows.length,
    todayEventCount: todayEvents.length,
    autoArchivedCount,
    pendingApprovalCount: pendingApprovalCount ?? 0,
    generatedAt: new Date().toISOString(),
  };

  await admin.from("daily_summaries").upsert(
    {
      user_id: userId,
      summary_date: summaryDate,
      content,
      generated_at: content.generatedAt,
    },
    { onConflict: "user_id,summary_date" },
  );

  return content;
}
