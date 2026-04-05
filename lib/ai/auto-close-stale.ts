/**
 * Auto-Close Stale Threads (Feature 2.11)
 *
 * Identifies threads that have had no activity for `staleDays` days and
 * appear to be resolved. Uses AI to confirm each thread is truly done before
 * archiving it. All actions are logged to the audit_log.
 *
 * Intended to be called from the sync pipeline after other automations have run.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { archiveThreadRemote } from "@/lib/email/outbound";

const DEFAULT_STALE_DAYS = 14;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThreadRow {
  id: string;
  user_id: string;
  subject: string | null;
  snippet: string | null;
  last_message_at: string | null;
  ai_category: string | null;
  ai_intent: string | null;
  ai_confidence: number | null;
}

// ---------------------------------------------------------------------------
// Deterministic resolution check
// ---------------------------------------------------------------------------

/**
 * Determine whether a thread is safe to auto-archive using a deterministic
 * heuristic based on existing AI signals and message state.
 *
 * A thread is considered resolved when:
 * - ai_intent is 'no_action' or 'ignore' with confidence >= 0.7
 *
 * This replaces the previous approach of calling ai-summarize with a yes/no
 * prompt, which was unreliable because ai-summarize has a hardcoded summarization
 * system prompt that ignores any task override passed in the payload.
 */
function isThreadResolved(thread: ThreadRow): boolean {
  const intent = thread.ai_intent ?? "";
  const confidence = thread.ai_confidence ?? 0;

  if (intent === "no_action" || intent === "ignore") {
    if (confidence >= 0.7) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// processStaleThreads
// ---------------------------------------------------------------------------

/**
 * Scan threads for a user that have been inactive for at least `staleDays` days,
 * verify with AI that each is resolved, then archive confirmed stale threads.
 *
 * Skips:
 * - Already archived threads (archived_at IS NOT NULL)
 * - Snoozed threads (snoozed_until IS NOT NULL)
 * - Deleted threads (deleted_at IS NOT NULL)
 * - Threads with open follow_ups in 'waiting' state
 *
 * @param userId    - The user's UUID
 * @param staleDays - Days of inactivity before a thread is a candidate (default 14)
 * @returns          Count of threads archived
 */
export async function processStaleThreads(
  userId: string,
  staleDays: number = DEFAULT_STALE_DAYS,
): Promise<{ archived: number; skipped: number; errors: number }> {
  const admin = createAdminClient();

  const cutoff = new Date(
    Date.now() - staleDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Fetch candidate threads — include AI signals for heuristic check
  const { data: threads, error: tErr } = await admin
    .from("threads")
    .select(
      "id, user_id, subject, snippet, last_message_at, ai_category, ai_intent, ai_confidence",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("snoozed_until", null)
    .is("deleted_at", null)
    .lt("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(20); // process in small batches to bound latency

  if (tErr) {
    throw new Error(`auto-close-stale: thread query failed: ${tErr.message}`);
  }

  if (!threads?.length) {
    return { archived: 0, skipped: 0, errors: 0 };
  }

  const threadIds = threads.map((t) => t.id as string);

  // Find threads with pending follow_ups — these are NOT stale
  const { data: pendingFollowUps } = await admin
    .from("follow_ups")
    .select("thread_id")
    .in("thread_id", threadIds)
    .eq("status", "waiting");

  const threadsWithPendingFollowUp = new Set(
    (pendingFollowUps ?? []).map((f) => f.thread_id as string),
  );

  let archived = 0;
  let skipped = 0;
  let errors = 0;

  for (const thread of threads as ThreadRow[]) {
    try {
      // Skip threads with pending follow_ups
      if (threadsWithPendingFollowUp.has(thread.id)) {
        skipped++;
        continue;
      }

      const subject = thread.subject ?? "(no subject)";
      const resolved = isThreadResolved(thread);

      if (!resolved) {
        skipped++;
        continue;
      }

      // Archive on the provider
      await archiveThreadRemote({ threadId: thread.id, userId });

      // Mark archived in local DB
      await admin
        .from("threads")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", thread.id)
        .eq("user_id", userId);

      await logAuditEvent({
        userId,
        actor: "system",
        action: "thread.auto_closed_stale",
        targetType: "thread",
        targetId: thread.id,
        details: {
          subject,
          staleDays,
          lastMessageAt: thread.last_message_at,
        },
        reversible: true,
      });

      archived++;
    } catch (e) {
      console.error(
        `auto-close-stale: error processing thread ${thread.id}:`,
        e instanceof Error ? e.message : e,
      );
      errors++;
    }
  }

  return { archived, skipped, errors };
}
