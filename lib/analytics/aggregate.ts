/**
 * Inbox Health Analytics
 *
 * Aggregates per-day metrics into analytics_daily and provides roll-up
 * computations for the dashboard. All writes use createAdminClient().
 * Read-only dashboard helpers use createAdminClient() too since they are
 * only invoked from authenticated API routes after session verification.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyAnalyticsRow {
  date: string;
  emails_received: number;
  emails_sent: number;
  emails_auto_archived: number;
  emails_auto_deleted: number;
  avg_response_time_minutes: number | null;
  ai_drafts_accepted: number;
  ai_drafts_edited: number;
  ai_drafts_discarded: number;
}

export interface VolumeTrend {
  date: string;
  received: number;
  sent: number;
}

export interface InboxHealthResult {
  volumeTrends: VolumeTrend[];
  automationRate: number;
  avgResponseTimeTrendMinutes: Array<{ date: string; avg: number | null }>;
  draftAcceptanceRate: number;
  busiestHours: Array<{ hour: number; count: number }>;
  totalReceived: number;
  totalSent: number;
  totalAutoArchived: number;
  totalAutoDeleted: number;
}

export interface HeatmapCell {
  hour: number;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  count: number;
}

// ---------------------------------------------------------------------------
// aggregateDailyAnalytics
// ---------------------------------------------------------------------------

/**
 * Compute and upsert analytics for a single user on a given date (UTC).
 * The date parameter should be an ISO date string like "2026-04-05".
 */
export async function aggregateDailyAnalytics(userId: string, date: string): Promise<void> {
  const admin = createAdminClient();

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  // Get user account IDs (to distinguish inbound vs outbound)
  const { data: accountRows, error: accErr } = await admin
    .from("accounts")
    .select("id, email_address")
    .eq("user_id", userId);

  if (accErr) throw new Error(`Failed to fetch accounts: ${accErr.message}`);
  const userAccountIds = new Set((accountRows ?? []).map((a) => a.id as string));
  const userEmails = new Set(
    (accountRows ?? []).map((a) => (a.email_address as string).toLowerCase()),
  );

  // Get threads for the user
  const { data: threads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  const threadIds = (threads ?? []).map((t) => t.id as string);

  // Count messages received and sent on this date
  let emailsReceived = 0;
  let emailsSent = 0;
  const responsePairsMinutes: number[] = [];

  if (threadIds.length > 0) {
    const { data: msgs } = await admin
      .from("messages")
      .select("account_id, sender, message_at, thread_id")
      .in("thread_id", threadIds)
      .gte("message_at", dayStart.toISOString())
      .lte("message_at", dayEnd.toISOString());

    // Track last inbound per thread for response time calculation
    const lastInboundPerThread = new Map<string, Date>();

    // Sort ascending to pair responses correctly
    const sorted = (msgs ?? []).sort(
      (a, b) => new Date(a.message_at as string).getTime() - new Date(b.message_at as string).getTime(),
    );

    for (const msg of sorted) {
      const isOutbound = userAccountIds.has(msg.account_id as string);
      const msgAt = new Date(msg.message_at as string);

      if (isOutbound) {
        emailsSent++;
        // Check for response pair
        const lastIn = lastInboundPerThread.get(msg.thread_id as string);
        if (lastIn && msgAt > lastIn) {
          const minutes = (msgAt.getTime() - lastIn.getTime()) / (1000 * 60);
          responsePairsMinutes.push(minutes);
          lastInboundPerThread.delete(msg.thread_id as string);
        }
      } else {
        // Check sender is not the user themselves
        const senderEmail = (msg.sender ?? "").toLowerCase().replace(/.*<([^>]+)>/, "$1").trim();
        if (!userEmails.has(senderEmail)) {
          emailsReceived++;
          lastInboundPerThread.set(msg.thread_id as string, msgAt);
        }
      }
    }
  }

  // Avg response time
  const avgResponseTimeMinutes =
    responsePairsMinutes.length > 0
      ? parseFloat(
          (responsePairsMinutes.reduce((a, b) => a + b, 0) / responsePairsMinutes.length).toFixed(2),
        )
      : null;

  // Auto-archived / auto-deleted counts from audit_log
  const { data: auditRows } = await admin
    .from("audit_log")
    .select("action")
    .eq("user_id", userId)
    .eq("actor", "system")
    .gte("created_at", dayStart.toISOString())
    .lte("created_at", dayEnd.toISOString());

  // Action strings written by automation: 'auto_archive', by user archive route: 'thread.archive',
  // and legacy: 'archive'. Similarly for delete variants.
  const AUTO_ARCHIVE_ACTIONS = new Set(["archive", "auto_archive", "thread.archive"]);
  const AUTO_DELETE_ACTIONS = new Set(["delete", "auto_delete", "thread.delete"]);

  let emailsAutoArchived = 0;
  let emailsAutoDeleted = 0;
  for (const row of auditRows ?? []) {
    const act = row.action as string;
    if (AUTO_ARCHIVE_ACTIONS.has(act)) emailsAutoArchived++;
    else if (AUTO_DELETE_ACTIONS.has(act)) emailsAutoDeleted++;
  }

  // AI draft stats from drafts table (where source='ai')
  const { data: aiDraftRows } = await admin
    .from("drafts")
    .select("status")
    .eq("user_id", userId)
    .eq("source", "ai")
    .gte("updated_at", dayStart.toISOString())
    .lte("updated_at", dayEnd.toISOString());

  let aiDraftsAccepted = 0;
  let aiDraftsEdited = 0;
  let aiDraftsDiscarded = 0;

  for (const row of aiDraftRows ?? []) {
    const status = row.status as string;
    if (status === "sent") {
      // If an AI draft was sent without edits we treat it as accepted.
      // We cannot distinguish "edited then sent" vs "sent as-is" here
      // without a separate flag, so sent = accepted for now.
      aiDraftsAccepted++;
    } else if (status === "discarded") {
      aiDraftsDiscarded++;
    } else {
      // Still in draft state but was created/updated today — edited
      aiDraftsEdited++;
    }
  }

  // Upsert the aggregated row
  const { error: upsertErr } = await admin
    .from("analytics_daily")
    .upsert(
      {
        user_id: userId,
        date,
        emails_received: emailsReceived,
        emails_sent: emailsSent,
        emails_auto_archived: emailsAutoArchived,
        emails_auto_deleted: emailsAutoDeleted,
        avg_response_time_minutes: avgResponseTimeMinutes,
        ai_drafts_accepted: aiDraftsAccepted,
        ai_drafts_edited: aiDraftsEdited,
        ai_drafts_discarded: aiDraftsDiscarded,
      },
      { onConflict: "user_id,date" },
    );

  if (upsertErr) throw new Error(`Failed to upsert analytics_daily: ${upsertErr.message}`);
}

// ---------------------------------------------------------------------------
// computeInboxHealth
// ---------------------------------------------------------------------------

type RangeKey = "7d" | "30d" | "90d";

function rangeTodays(range: RangeKey): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

/**
 * Fetch pre-aggregated analytics_daily rows and derive dashboard metrics.
 * Does not re-aggregate from raw messages — uses the already-computed rows.
 */
export async function computeInboxHealth(
  userId: string,
  range: RangeKey = "7d",
): Promise<InboxHealthResult> {
  const admin = createAdminClient();
  const days = rangeTodays(range);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from("analytics_daily")
    .select("*")
    .eq("user_id", userId)
    .gte("date", sinceDate)
    .order("date", { ascending: true });

  if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);

  const typedRows = (rows ?? []) as DailyAnalyticsRow[];

  const volumeTrends: VolumeTrend[] = typedRows.map((r) => ({
    date: r.date,
    received: r.emails_received,
    sent: r.emails_sent,
  }));

  const totalReceived = typedRows.reduce((s, r) => s + r.emails_received, 0);
  const totalSent = typedRows.reduce((s, r) => s + r.emails_sent, 0);
  const totalAutoArchived = typedRows.reduce((s, r) => s + r.emails_auto_archived, 0);
  const totalAutoDeleted = typedRows.reduce((s, r) => s + r.emails_auto_deleted, 0);
  const totalEmails = totalReceived + totalSent;
  const automationRate =
    totalEmails > 0
      ? parseFloat(((totalAutoArchived + totalAutoDeleted) / totalEmails).toFixed(4))
      : 0;

  const avgResponseTimeTrend = typedRows.map((r) => ({
    date: r.date,
    avg: r.avg_response_time_minutes,
  }));

  const totalAiSent = typedRows.reduce((s, r) => s + r.ai_drafts_accepted, 0);
  const totalAiTotal = typedRows.reduce(
    (s, r) => s + r.ai_drafts_accepted + r.ai_drafts_edited + r.ai_drafts_discarded,
    0,
  );
  const draftAcceptanceRate =
    totalAiTotal > 0 ? parseFloat((totalAiSent / totalAiTotal).toFixed(4)) : 0;

  // Busiest hours: query messages within the range and group by hour
  const { data: threadRows } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  const threadIds = (threadRows ?? []).map((t) => t.id as string);
  const hourCounts: number[] = new Array(24).fill(0);

  if (threadIds.length > 0) {
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - days);

    const { data: msgs } = await admin
      .from("messages")
      .select("message_at")
      .in("thread_id", threadIds)
      .gte("message_at", rangeStart.toISOString());

    for (const msg of msgs ?? []) {
      const hour = new Date(msg.message_at as string).getUTCHours();
      hourCounts[hour]++;
    }
  }

  const busiestHours = hourCounts.map((count, hour) => ({ hour, count }));

  return {
    volumeTrends,
    automationRate,
    avgResponseTimeTrendMinutes: avgResponseTimeTrend,
    draftAcceptanceRate,
    busiestHours,
    totalReceived,
    totalSent,
    totalAutoArchived,
    totalAutoDeleted,
  };
}

// ---------------------------------------------------------------------------
// heatmap
// ---------------------------------------------------------------------------

/**
 * Return message volume by hour (0–23) and day-of-week (0=Sun, 6=Sat)
 * for the past `days` days, suitable for rendering a heatmap grid.
 */
export async function computeVolumeHeatmap(
  userId: string,
  days = 90,
): Promise<HeatmapCell[]> {
  const admin = createAdminClient();

  const { data: threadRows } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  const threadIds = (threadRows ?? []).map((t) => t.id as string);

  if (threadIds.length === 0) {
    return buildEmptyHeatmap();
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: msgs, error } = await admin
    .from("messages")
    .select("message_at")
    .in("thread_id", threadIds)
    .gte("message_at", since.toISOString());

  if (error) throw new Error(`Failed to fetch messages for heatmap: ${error.message}`);

  // Accumulate counts into a 7x24 grid
  const grid: Record<string, number> = {};

  for (const msg of msgs ?? []) {
    const d = new Date(msg.message_at as string);
    const hour = d.getUTCHours();
    const dow = d.getUTCDay();
    const key = `${dow}:${hour}`;
    grid[key] = (grid[key] ?? 0) + 1;
  }

  const cells: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ hour, dayOfWeek: dow, count: grid[`${dow}:${hour}`] ?? 0 });
    }
  }

  return cells;
}

function buildEmptyHeatmap(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ hour, dayOfWeek: dow, count: 0 });
    }
  }
  return cells;
}
