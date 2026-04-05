/**
 * Auto-Send — Feature 2.8
 *
 * Finds AI-drafted replies for threads where the user has enabled auto-send
 * for the sender / domain / category, enforces a rate limit of 10 sends per
 * hour per account, sends the draft via the provider, and creates a post-facto
 * approval_queue entry for review.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendReply } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import { checkSenderClassification } from "@/lib/sender-classifications/check";

const AUTO_SEND_MIN_CONFIDENCE = 0.95;
const HOURLY_RATE_LIMIT = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutoSendConfigRow {
  scope_type: string;
  scope_value: string;
  enabled: boolean;
}

interface ThreadCandidate {
  id: string;
  ai_confidence: number;
  ai_category: string | null;
  sender_email: string | null;
  primary_account_id: string | null;
}

interface DraftRow {
  id: string;
  body_text: string;
  body_html: string | null;
  account_id: string;
}

interface AccountRateRow {
  id: string;
  auto_sends_this_hour: number;
  auto_send_hour_reset_at: string | null;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Check whether the account is under its hourly auto-send rate limit.
 * Resets the counter if the current hour window has elapsed.
 *
 * @returns true if the send is allowed (and the counter has been incremented).
 */
export async function checkRateLimit(accountId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: acc, error } = await admin
    .from("accounts")
    .select("id, auto_sends_this_hour, auto_send_hour_reset_at")
    .eq("id", accountId)
    .maybeSingle();

  if (error || !acc) {
    throw new Error(`checkRateLimit: account ${accountId} not found: ${error?.message ?? "missing"}`);
  }

  const row = acc as AccountRateRow;
  const now = new Date();
  const resetAt = row.auto_send_hour_reset_at ? new Date(row.auto_send_hour_reset_at) : null;
  const windowExpired = !resetAt || now >= resetAt;

  const currentCount = windowExpired ? 0 : (row.auto_sends_this_hour ?? 0);

  if (currentCount >= HOURLY_RATE_LIMIT) {
    return false;
  }

  // Increment counter; reset window if expired
  const newResetAt = windowExpired
    ? new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    : row.auto_send_hour_reset_at;

  const { error: updateErr } = await admin
    .from("accounts")
    .update({
      auto_sends_this_hour: currentCount + 1,
      auto_send_hour_reset_at: newResetAt,
    })
    .eq("id", accountId);

  if (updateErr) {
    throw new Error(`checkRateLimit: failed to update counter: ${updateErr.message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Auto-send config check
// ---------------------------------------------------------------------------

/**
 * Determine whether auto-send is enabled for a specific sender/domain/category
 * combination, based on the user's auto_send_config entries.
 */
async function isAutoSendEnabled(
  userId: string,
  senderEmail: string,
  aiCategory: string | null,
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: configs } = await admin
    .from("auto_send_config")
    .select("scope_type, scope_value, enabled")
    .eq("user_id", userId)
    .eq("enabled", true);

  const rows = (configs ?? []) as AutoSendConfigRow[];
  if (rows.length === 0) {
    return false;
  }

  const normalizedEmail = senderEmail.toLowerCase().trim();
  const domain = (() => {
    const at = normalizedEmail.lastIndexOf("@");
    return at > 0 ? normalizedEmail.slice(at + 1) : null;
  })();

  for (const row of rows) {
    if (row.scope_type === "sender" && row.scope_value.toLowerCase() === normalizedEmail) {
      return true;
    }
    if (row.scope_type === "domain" && domain && row.scope_value.toLowerCase() === domain) {
      return true;
    }
    if (
      row.scope_type === "category" &&
      aiCategory &&
      row.scope_value.toLowerCase() === aiCategory.toLowerCase()
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

/**
 * Process auto-send for a user.
 *
 * Steps per qualifying thread:
 *   1. Thread must have ai_intent IN ('reply','reply_urgent') and ai_confidence >= 0.95
 *   2. Auto-send must be enabled for the thread's sender / domain / category
 *   3. Sender must not be classified as 'never_auto_send'
 *   4. Account must be under the hourly rate limit
 *   5. An AI draft (source='ai', status='draft') must exist for the thread
 *   6. Send the draft, mark it sent, log to audit_log, enqueue post-facto review
 *
 * @returns Counts of sent and skipped threads.
 */
export async function processAutoSend(
  userId: string,
): Promise<{ sent: number; skipped: number }> {
  const admin = createAdminClient();

  // Step 1: find qualifying thread candidates
  const { data: threadRows, error: threadErr } = await admin
    .from("threads")
    .select("id, ai_confidence, ai_category, sender_email, primary_account_id")
    .eq("user_id", userId)
    .in("ai_intent", ["reply", "reply_urgent"])
    .gte("ai_confidence", AUTO_SEND_MIN_CONFIDENCE)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(20);

  if (threadErr) {
    throw new Error(`processAutoSend: failed to query threads: ${threadErr.message}`);
  }

  const candidates = (threadRows ?? []) as ThreadCandidate[];

  if (candidates.length === 0) {
    return { sent: 0, skipped: 0 };
  }

  // Pre-load AI drafts for all candidate threads in one query
  const threadIds = candidates.map((c) => c.id);
  const { data: draftRows } = await admin
    .from("drafts")
    .select("id, thread_id, body_text, body_html, account_id")
    .in("thread_id", threadIds)
    .eq("user_id", userId)
    .eq("source", "ai")
    .eq("status", "draft");

  const draftByThread = new Map<string, DraftRow>();
  for (const d of draftRows ?? []) {
    const tid = d.thread_id as string;
    if (!draftByThread.has(tid)) {
      draftByThread.set(tid, d as DraftRow);
    }
  }

  let sent = 0;
  let skipped = 0;

  for (const thread of candidates) {
    const senderEmail = (thread.sender_email ?? "").toLowerCase().trim();

    // Must have an AI draft
    const draft = draftByThread.get(thread.id);
    if (!draft) {
      skipped++;
      continue;
    }

    // Auto-send config check
    const autoSendEnabled = await isAutoSendEnabled(userId, senderEmail, thread.ai_category);
    if (!autoSendEnabled) {
      skipped++;
      continue;
    }

    // Never-auto-send classification check
    if (senderEmail) {
      const classification = await checkSenderClassification(userId, senderEmail);
      if (classification === "never_auto_send") {
        skipped++;
        continue;
      }
    }

    // Determine which account to use
    const accountId = (draft.account_id ?? thread.primary_account_id) as string | null;
    if (!accountId) {
      skipped++;
      continue;
    }

    // Rate limit check (also increments the counter)
    const allowed = await checkRateLimit(accountId);
    if (!allowed) {
      skipped++;
      continue;
    }

    // Send the draft
    try {
      await sendReply({
        threadId: thread.id,
        userId,
        bodyText: draft.body_text as string,
        bodyHtml: (draft.body_html as string | null) ?? null,
        accountId,
      });

      // Mark draft as sent
      await admin
        .from("drafts")
        .update({ status: "sent" })
        .eq("id", draft.id);

      // Audit log
      await logAuditEvent({
        userId,
        actor: "system",
        action: "auto_send",
        targetType: "thread",
        targetId: thread.id,
        details: {
          draft_id: draft.id,
          sender_email: senderEmail,
          ai_confidence: thread.ai_confidence,
          ai_category: thread.ai_category,
          account_id: accountId,
        },
        reversible: false,
      }).catch((e) => console.error("audit log failed (non-fatal):", e));

      // Post-facto approval queue entry for user review
      void Promise.resolve(
        admin.from("approval_queue").insert({
          user_id: userId,
          thread_id: thread.id,
          proposed_action: "auto_send",
          proposed_details: {
            draft_id: draft.id,
            sender_email: senderEmail,
            ai_confidence: thread.ai_confidence,
          },
          confidence: thread.ai_confidence,
          reasoning: `Auto-sent AI draft reply (confidence ${thread.ai_confidence})`,
          status: "approved",
          resolved_at: new Date().toISOString(),
        }),
      ).catch((e: unknown) => console.error("approval_queue insert failed (non-fatal):", e));

      sent++;
    } catch (err) {
      console.error(`Auto-send failed for thread ${thread.id}:`, err);
      skipped++;
    }
  }

  return { sent, skipped };
}
