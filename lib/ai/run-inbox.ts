/**
 * Run My Inbox Mode (Feature 7.5)
 *
 * When active, the AI fully manages the inbox on the user's behalf.
 * Emergency senders (configured by the user) bypass the mode and still
 * surface to the user. Everything else is auto-handled and logged.
 *
 * State is persisted in user_preferences:
 *   run_inbox_mode_active       boolean
 *   run_inbox_mode_until        timestamptz | null
 *   run_inbox_emergency_senders jsonb (string[])
 *   run_inbox_summary           jsonb (RunInboxReport)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunInboxReport {
  activatedAt: string;
  deactivatedAt: string;
  threadsAutoHandled: number;
  threadsEscalated: number;
  draftsGenerated: number;
  autoArchivedCount: number;
  topActions: Array<{ action: string; count: number }>;
}

export interface RunInboxStatus {
  active: boolean;
  until: string | null;
  emergencySenders: string[];
  summary: RunInboxReport | null;
}

// ---------------------------------------------------------------------------
// activateRunInboxMode
// ---------------------------------------------------------------------------

/**
 * Enable Run My Inbox mode for a user.
 *
 * @param userId            - The user's UUID
 * @param until             - Optional ISO timestamp when the mode auto-expires
 * @param emergencySenders  - Email addresses that bypass the mode and always surface
 */
export async function activateRunInboxMode(
  userId: string,
  until: string | null,
  emergencySenders: string[] = [],
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        run_inbox_mode_active: true,
        run_inbox_mode_until: until,
        run_inbox_emergency_senders: emergencySenders,
        run_inbox_summary: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(`Failed to activate Run My Inbox mode: ${error.message}`);
  }

  await logAuditEvent({
    userId,
    actor: "user",
    action: "run_inbox.activated",
    targetType: "user_preferences",
    targetId: userId,
    details: { until, emergencySenders },
    reversible: true,
  });
}

// ---------------------------------------------------------------------------
// deactivateRunInboxMode
// ---------------------------------------------------------------------------

/**
 * Disable Run My Inbox mode.
 * Generates a summary from the audit log and stores it in user_preferences
 * so the user can review what happened while they were away.
 *
 * @param userId - The user's UUID
 * @returns The generated RunInboxReport
 */
export async function deactivateRunInboxMode(userId: string): Promise<RunInboxReport> {
  const admin = createAdminClient();

  // Determine when the mode was activated from the audit log
  const { data: activationRow } = await admin
    .from("audit_log")
    .select("created_at")
    .eq("user_id", userId)
    .eq("action", "run_inbox.activated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activatedAt = (activationRow?.created_at as string | null) ?? new Date().toISOString();

  // Fetch all automated actions taken since activation
  const { data: auditRows } = await admin
    .from("audit_log")
    .select("action, created_at")
    .eq("user_id", userId)
    .in("actor", ["system", "rule"])
    .gte("created_at", activatedAt);

  const rows = auditRows ?? [];

  // Tally actions
  const actionCounts: Record<string, number> = {};
  for (const row of rows) {
    const action = row.action as string;
    actionCounts[action] = (actionCounts[action] ?? 0) + 1;
  }

  const topActions = Object.entries(actionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }));

  // Count specific action categories from the tally
  const autoArchivedCount = actionCounts["thread.archive"] ?? 0;
  const draftsGenerated =
    (actionCounts["thread.follow_up_drafted"] ?? 0) +
    (actionCounts["draft.ai_generated"] ?? 0);
  const threadsEscalated = actionCounts["thread.escalated"] ?? 0;
  const threadsAutoHandled = Math.max(0, rows.length - threadsEscalated);

  const report: RunInboxReport = {
    activatedAt,
    deactivatedAt: new Date().toISOString(),
    threadsAutoHandled,
    threadsEscalated,
    draftsGenerated,
    autoArchivedCount,
    topActions,
  };

  // Persist the report and deactivate the mode
  const { error } = await admin
    .from("user_preferences")
    .update({
      run_inbox_mode_active: false,
      run_inbox_mode_until: null,
      run_inbox_summary: report,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to deactivate Run My Inbox mode: ${error.message}`);
  }

  await logAuditEvent({
    userId,
    actor: "user",
    action: "run_inbox.deactivated",
    targetType: "user_preferences",
    targetId: userId,
    details: { report },
    reversible: false,
  });

  return report;
}

// ---------------------------------------------------------------------------
// isRunInboxActive
// ---------------------------------------------------------------------------

/**
 * Check if Run My Inbox mode is currently active for a user.
 * Automatically deactivates if the configured expiry time has passed.
 *
 * @returns true if the mode is active (and not expired)
 */
export async function isRunInboxActive(userId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: prefs } = await admin
    .from("user_preferences")
    .select("run_inbox_mode_active, run_inbox_mode_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (!prefs || !prefs.run_inbox_mode_active) {
    return false;
  }

  const until = prefs.run_inbox_mode_until as string | null;
  if (until && new Date(until) <= new Date()) {
    // Mode has expired — deactivate silently
    await deactivateRunInboxMode(userId).catch((e) =>
      console.error("run-inbox: auto-deactivation failed:", e),
    );
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// getRunInboxStatus
// ---------------------------------------------------------------------------

/**
 * Return the current Run My Inbox status and any stored summary report.
 */
export async function getRunInboxStatus(userId: string): Promise<RunInboxStatus> {
  const admin = createAdminClient();

  const { data: prefs } = await admin
    .from("user_preferences")
    .select(
      "run_inbox_mode_active, run_inbox_mode_until, run_inbox_emergency_senders, run_inbox_summary",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!prefs) {
    return { active: false, until: null, emergencySenders: [], summary: null };
  }

  const active = (prefs.run_inbox_mode_active as boolean | null) ?? false;
  const until = (prefs.run_inbox_mode_until as string | null) ?? null;

  // If the expiry has passed, treat as inactive (but don't auto-deactivate here — let
  // isRunInboxActive handle that on the next pipeline check).
  const effectivelyActive = active && (!until || new Date(until) > new Date());

  return {
    active: effectivelyActive,
    until,
    emergencySenders: (prefs.run_inbox_emergency_senders as string[] | null) ?? [],
    summary: (prefs.run_inbox_summary as RunInboxReport | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// generateRunInboxReport
// ---------------------------------------------------------------------------

/**
 * Format the stored summary report for display.
 * If no summary is available (mode still active or never run), returns null.
 */
export async function generateRunInboxReport(userId: string): Promise<RunInboxReport | null> {
  const admin = createAdminClient();

  const { data: prefs } = await admin
    .from("user_preferences")
    .select("run_inbox_summary")
    .eq("user_id", userId)
    .maybeSingle();

  return (prefs?.run_inbox_summary as RunInboxReport | null) ?? null;
}
