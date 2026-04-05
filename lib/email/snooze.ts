import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * Snooze a thread until the given timestamp.
 * Uses the admin client because authenticated users have read-only access to threads.
 */
export async function snoozeThread(
  threadId: string,
  userId: string,
  until: Date,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("threads")
    .update({ snoozed_until: until.toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`snoozeThread failed: ${error.message}`);
  }

  await logAuditEvent({
    userId,
    actor: "user",
    action: "snooze",
    targetType: "thread",
    targetId: threadId,
    details: { snoozed_until: until.toISOString() },
    reversible: true,
  });
}

/**
 * Remove snooze from a single thread immediately (manual unsnooze).
 */
export async function unsnoozeThread(threadId: string, userId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("threads")
    .update({ snoozed_until: null })
    .eq("id", threadId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`unsnoozeThread failed: ${error.message}`);
  }

  await logAuditEvent({
    userId,
    actor: "user",
    action: "unsnooze",
    targetType: "thread",
    targetId: threadId,
    details: {},
    reversible: false,
  });
}

/**
 * System job: find all threads whose snooze has expired and clear snoozed_until.
 * Called from the sync pipeline so threads resurface in the inbox automatically.
 * Returns the number of threads that were unsnoozed.
 */
export async function unsnoozeThreadsDue(): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Fetch the threads that are due so we can audit each one.
  // Exclude deleted or archived threads — they shouldn't resurface in the inbox.
  const { data: due, error: fetchErr } = await admin
    .from("threads")
    .select("id, user_id")
    .lte("snoozed_until", now)
    .not("snoozed_until", "is", null)
    .is("deleted_at", null)
    .is("archived_at", null);

  if (fetchErr) {
    throw new Error(`unsnoozeThreadsDue fetch failed: ${fetchErr.message}`);
  }

  const rows = due ?? [];
  if (rows.length === 0) {
    return 0;
  }

  const ids = rows.map((r) => r.id as string);

  const { error: updateErr } = await admin
    .from("threads")
    .update({ snoozed_until: null })
    .in("id", ids);

  if (updateErr) {
    throw new Error(`unsnoozeThreadsDue update failed: ${updateErr.message}`);
  }

  // Log one audit entry per unique user so the audit trail is accurate
  const byUser = new Map<string, string[]>();
  for (const r of rows) {
    const uid = r.user_id as string;
    const tid = r.id as string;
    const list = byUser.get(uid) ?? [];
    list.push(tid);
    byUser.set(uid, list);
  }

  const auditPromises: Promise<unknown>[] = [];
  for (const [uid, tids] of byUser.entries()) {
    for (const tid of tids) {
      auditPromises.push(
        logAuditEvent({
          userId: uid,
          actor: "system",
          action: "unsnooze",
          targetType: "thread",
          targetId: tid,
          details: { reason: "snooze_expired" },
          reversible: false,
        }),
      );
    }
  }
  await Promise.allSettled(auditPromises);

  return rows.length;
}
