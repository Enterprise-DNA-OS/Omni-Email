/**
 * Auto-Delete / Auto-Junk — Feature 2.2
 *
 * Soft-deletes threads that the AI has classified as `delete` intent with
 * >= 0.95 confidence, subject to a set of safety guards. A separate purge
 * function hard-deletes rows whose 30-day grace period has expired.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { deleteThreadRemote } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import { isVipSender, checkSenderClassification } from "@/lib/sender-classifications/check";

const AUTO_DELETE_CONFIDENCE = 0.95;
/** Days before a soft-deleted thread is permanently erased. */
const HARD_DELETE_GRACE_DAYS = 30;

/** Pattern for noreply / system sender addresses — never treat as a contact. */
const NOREPLY_RE = /no.?reply|mailer-daemon|postmaster|bounce|noreply/i;

interface ThreadCandidate {
  id: string;
  ai_confidence: number;
  ai_category: string | null;
  sender_email: string | null;
}

interface MessageAttachmentRow {
  thread_id: string;
  attachments: unknown;
}

/**
 * Soft-delete a thread: set deleted_at = now(), hard_delete_after = now() + 30d.
 */
async function softDeleteThread(threadId: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date();
  const hardDeleteAfter = new Date(now);
  hardDeleteAfter.setDate(hardDeleteAfter.getDate() + HARD_DELETE_GRACE_DAYS);

  const { error } = await admin
    .from("threads")
    .update({
      deleted_at: now.toISOString(),
      hard_delete_after: hardDeleteAfter.toISOString(),
    })
    .eq("id", threadId);

  if (error) {
    throw new Error(`Failed to soft-delete thread ${threadId}: ${error.message}`);
  }
}

/**
 * Check whether the sender email belongs to a contact the user has previously
 * corresponded with (i.e., they appear as a sender in the contacts view).
 * We query the messages table for prior sent/received messages from this address
 * outside the candidate thread.
 */
async function isSenderKnownContact(
  userId: string,
  senderEmail: string,
  excludeThreadId: string,
): Promise<boolean> {
  if (!senderEmail || NOREPLY_RE.test(senderEmail)) {
    return false;
  }
  const admin = createAdminClient();
  // Check if this sender has appeared in messages on other threads for this user
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("sender", senderEmail)
    .neq("thread_id", excludeThreadId)
    .limit(1)
    // Scope to user's threads via a join filter — use a subquery via the in() operator
    .in(
      "thread_id",
      // We can't do a true correlated subquery through the REST client,
      // so we pull thread IDs for this user and use them as a filter.
      // For performance we cap at 500; this is sufficient for the guard.
      await (async () => {
        const { data: tids } = await admin
          .from("threads")
          .select("id")
          .eq("user_id", userId)
          .limit(500);
        return (tids ?? []).map((r) => r.id as string);
      })(),
    );

  return (data ?? []).length > 0;
}

/**
 * Process auto-delete for a user. Finds threads with ai_intent = 'delete' and
 * ai_confidence >= 0.95 that have not been soft-deleted or archived yet, applies
 * multiple safety checks, then soft-deletes qualifying threads and moves them to
 * trash at the provider.
 *
 * @returns Counts of deleted and skipped threads.
 */
export async function processAutoDelete(
  userId: string,
): Promise<{ deleted: number; skipped: number }> {
  const admin = createAdminClient();

  const { data: threadRows, error: threadErr } = await admin
    .from("threads")
    .select("id, ai_confidence, ai_category, sender_email")
    .eq("user_id", userId)
    .eq("ai_intent", "delete")
    .gte("ai_confidence", AUTO_DELETE_CONFIDENCE)
    .is("deleted_at", null)
    .is("archived_at", null);

  if (threadErr) {
    throw new Error(`Failed to query delete candidates: ${threadErr.message}`);
  }

  const candidates = (threadRows ?? []) as ThreadCandidate[];

  if (candidates.length === 0) {
    return { deleted: 0, skipped: 0 };
  }

  // Batch-load attachment + message-count info for all candidates in one query
  const threadIds = candidates.map((c) => c.id);

  const { data: msgRows } = await admin
    .from("messages")
    .select("thread_id, attachments")
    .in("thread_id", threadIds);

  // Count messages per thread and flag which have attachments
  const msgCountMap: Record<string, number> = {};
  const hasAttachmentsSet = new Set<string>();
  for (const m of msgRows ?? []) {
    const tid = m.thread_id as string;
    msgCountMap[tid] = (msgCountMap[tid] ?? 0) + 1;
    const atts = (m as MessageAttachmentRow).attachments;
    if (Array.isArray(atts) && atts.length > 0) {
      hasAttachmentsSet.add(tid);
    }
  }

  let deleted = 0;
  let skipped = 0;

  for (const thread of candidates) {
    const senderEmail = (thread.sender_email ?? "").toLowerCase().trim();

    // Safety guard 1: VIP sender — never auto-delete
    if (senderEmail) {
      const vip = await isVipSender(userId, senderEmail);
      if (vip) {
        await logAuditEvent({
          userId,
          actor: "system",
          action: "auto_delete_skipped_vip",
          targetType: "thread",
          targetId: thread.id,
          details: { sender_email: senderEmail, ai_confidence: thread.ai_confidence },
          reversible: false,
        }).catch((e) => console.error("audit log failed (non-fatal):", e));
        skipped++;
        continue;
      }
    }

    // Safety guard 2: safe-list domain
    if (senderEmail) {
      const classification = await checkSenderClassification(userId, senderEmail);
      if (classification === "safe") {
        await logAuditEvent({
          userId,
          actor: "system",
          action: "auto_delete_skipped_safe_sender",
          targetType: "thread",
          targetId: thread.id,
          details: { sender_email: senderEmail, ai_confidence: thread.ai_confidence },
          reversible: false,
        }).catch((e) => console.error("audit log failed (non-fatal):", e));
        skipped++;
        continue;
      }
    }

    // Safety guard 3: has attachments — may be important, skip
    if (hasAttachmentsSet.has(thread.id)) {
      skipped++;
      continue;
    }

    // Safety guard 4: more than 1 message — it's a conversation, skip
    const msgCount = msgCountMap[thread.id] ?? 0;
    if (msgCount > 1) {
      skipped++;
      continue;
    }

    // Safety guard 5: sender is a known contact
    if (senderEmail) {
      const knownContact = await isSenderKnownContact(userId, senderEmail, thread.id);
      if (knownContact) {
        skipped++;
        continue;
      }
    }

    // All guards passed — soft delete
    try {
      await softDeleteThread(thread.id);

      // Replicate to provider (move to trash); non-fatal if it fails
      try {
        await deleteThreadRemote({ threadId: thread.id, userId });
      } catch (remoteErr) {
        console.error(
          `deleteThreadRemote failed for thread ${thread.id} (non-fatal):`,
          remoteErr,
        );
      }

      await logAuditEvent({
        userId,
        actor: "system",
        action: "auto_delete",
        targetType: "thread",
        targetId: thread.id,
        details: {
          sender_email: senderEmail,
          ai_confidence: thread.ai_confidence,
          ai_category: thread.ai_category,
          hard_delete_after_days: HARD_DELETE_GRACE_DAYS,
        },
        reversible: true,
      }).catch((e) => console.error("audit log failed (non-fatal):", e));

      deleted++;
    } catch (err) {
      console.error(`Auto-delete failed for thread ${thread.id}:`, err);
      skipped++;
    }
  }

  return { deleted, skipped };
}

/**
 * Permanently erase all threads whose hard_delete_after timestamp has elapsed.
 * Deletes in dependency order: thread_sources → messages → threads.
 *
 * @returns Number of threads permanently deleted.
 */
export async function purgeHardDeleteDue(): Promise<{ purged: number }> {
  const admin = createAdminClient();

  const now = new Date().toISOString();

  // Find threads past their hard-delete deadline
  const { data: dueRows, error: fetchErr } = await admin
    .from("threads")
    .select("id")
    .not("hard_delete_after", "is", null)
    .not("deleted_at", "is", null)
    .lte("hard_delete_after", now);

  if (fetchErr) {
    throw new Error(`Failed to query hard-delete candidates: ${fetchErr.message}`);
  }

  const dueIds = (dueRows ?? []).map((r) => r.id as string);

  if (dueIds.length === 0) {
    return { purged: 0 };
  }

  // Delete in FK dependency order: thread_sources first, then messages, then threads
  const { error: srcErr } = await admin
    .from("thread_sources")
    .delete()
    .in("thread_id", dueIds);
  if (srcErr) {
    throw new Error(`Hard-delete: failed to delete thread_sources: ${srcErr.message}`);
  }

  const { error: msgErr } = await admin
    .from("messages")
    .delete()
    .in("thread_id", dueIds);
  if (msgErr) {
    throw new Error(`Hard-delete: failed to delete messages: ${msgErr.message}`);
  }

  const { error: threadErr } = await admin
    .from("threads")
    .delete()
    .in("id", dueIds);
  if (threadErr) {
    throw new Error(`Hard-delete: failed to delete threads: ${threadErr.message}`);
  }

  return { purged: dueIds.length };
}
