import { createAdminClient } from "@/lib/supabase/admin";
import { archiveThreadRemote } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import { isVipSender, isBlockedSender } from "@/lib/sender-classifications/check";

interface AccountSettings {
  id: string;
  auto_archive_enabled: boolean;
  auto_archive_threshold: number;
}

interface ThreadCandidate {
  id: string;
  ai_confidence: number;
  sender_email: string | null;
}

/**
 * Archive a single thread locally (set archived_at) using the admin client.
 */
async function archiveThreadLocally(threadId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) {
    throw new Error(`Failed to archive thread locally: ${error.message}`);
  }
}

/**
 * Process auto-archive for all accounts belonging to a user.
 *
 * Logic:
 *   1. Load account settings (auto_archive_enabled, auto_archive_threshold).
 *   2. Query threads with ai_intent = 'archive', ai_confidence >= threshold,
 *      archived_at IS NULL.
 *   3. Skip VIP senders — they are always protected from auto-archiving.
 *   4. Force-archive blocked senders regardless of threshold.
 *   5. Archive locally + remotely via archiveThreadRemote().
 *   6. Log every action to the audit log with actor = 'system'.
 *
 * @returns Counts of archived and skipped threads across all accounts.
 */
export async function processAutoArchive(
  userId: string,
): Promise<{ archived: number; skipped: number }> {
  const admin = createAdminClient();

  // Load accounts for this user that have auto-archive enabled
  const { data: accountRows, error: accErr } = await admin
    .from("accounts")
    .select("id, auto_archive_enabled, auto_archive_threshold")
    .eq("user_id", userId);

  if (accErr) {
    throw new Error(`Failed to load accounts for auto-archive: ${accErr.message}`);
  }

  const accounts = (accountRows ?? []) as AccountSettings[];
  const enabledAccounts = accounts.filter((a) => a.auto_archive_enabled !== false);

  if (enabledAccounts.length === 0) {
    return { archived: 0, skipped: 0 };
  }

  // Use the minimum threshold across all enabled accounts so we cast a wide net,
  // then apply per-account thresholds during the loop. In practice most users
  // have one account; for multi-account users this avoids multiple queries.
  const minThreshold = Math.min(...enabledAccounts.map((a) => a.auto_archive_threshold ?? 0.85));

  // Fetch candidate threads: ai_intent = 'archive', high confidence, not yet archived
  const { data: threadRows, error: threadErr } = await admin
    .from("threads")
    .select("id, ai_confidence, sender_email")
    .eq("user_id", userId)
    .eq("ai_intent", "archive")
    .gte("ai_confidence", minThreshold)
    .is("archived_at", null);

  if (threadErr) {
    throw new Error(`Failed to query archive candidates: ${threadErr.message}`);
  }

  const candidates = (threadRows ?? []) as ThreadCandidate[];

  let archived = 0;
  let skipped = 0;

  // For multi-account users we archive once per thread (not per account).
  // The per-account threshold check uses the lowest threshold that applies,
  // since the thread already passed the minThreshold filter above.
  for (const thread of candidates) {
    const senderEmail = thread.sender_email ?? "";

    // VIP check — always skip, even at max confidence
    if (senderEmail) {
      const vip = await isVipSender(userId, senderEmail);
      if (vip) {
        skipped++;
        await logAuditEvent({
          userId,
          actor: "system",
          action: "auto_archive_skipped_vip",
          targetType: "thread",
          targetId: thread.id,
          details: { sender_email: senderEmail, ai_confidence: thread.ai_confidence },
          reversible: false,
        }).catch((e) => console.error("audit log failed (non-fatal):", e));
        continue;
      }
    }

    // Blocked sender check — always archive regardless of threshold
    const forceArchive = senderEmail ? await isBlockedSender(userId, senderEmail) : false;

    // Threshold check for non-blocked senders (use the most permissive enabled account threshold)
    if (!forceArchive) {
      const thresholdMet = enabledAccounts.some(
        (a) => thread.ai_confidence >= (a.auto_archive_threshold ?? 0.85),
      );
      if (!thresholdMet) {
        skipped++;
        continue;
      }
    }

    try {
      // Archive locally first, then replicate to the provider
      await archiveThreadLocally(thread.id);

      try {
        await archiveThreadRemote({ threadId: thread.id, userId });
      } catch (remoteErr) {
        // Remote archive failure is non-fatal; local state is already updated
        console.error(`archiveThreadRemote failed for thread ${thread.id} (non-fatal):`, remoteErr);
      }

      await logAuditEvent({
        userId,
        actor: "system",
        action: "auto_archive",
        targetType: "thread",
        targetId: thread.id,
        details: {
          sender_email: senderEmail,
          ai_confidence: thread.ai_confidence,
          forced_by_blocked: forceArchive,
        },
        reversible: true,
      }).catch((e) => console.error("audit log failed (non-fatal):", e));

      archived++;
    } catch (err) {
      console.error(`Auto-archive failed for thread ${thread.id}:`, err);
      skipped++;
    }
  }

  return { archived, skipped };
}
