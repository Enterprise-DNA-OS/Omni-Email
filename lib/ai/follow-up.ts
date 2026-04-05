/**
 * Auto-Follow-Up engine (Feature 2.9)
 *
 * Detects outbound messages where no reply has arrived after 3 days, creates
 * follow_ups records to track them, and generates AI draft follow-up messages
 * for any that are now due.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const AWAIT_REPLY_DAYS = 3;
const FOLLOW_UP_INTERVAL_DAYS = 3;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FollowUpRow {
  id: string;
  user_id: string;
  thread_id: string;
  account_id: string;
  original_message_id: string | null;
  follow_up_count: number;
  next_follow_up_at: string | null;
  max_follow_ups: number;
  status: "waiting" | "followed_up" | "replied" | "cancelled";
  created_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  account_id: string;
  sender: string | null;
  recipients: string[] | null;
  body_html: string | null;
  body_text: string | null;
  message_at: string;
}

// ---------------------------------------------------------------------------
// AI follow-up generation
// ---------------------------------------------------------------------------

/**
 * Call the Supabase ai-follow-up edge function to generate a follow-up message.
 * Returns the draft body text on success.
 */
async function callFollowUpEdgeFunction(params: {
  subject: string;
  originalBody: string;
  recipientEmail: string;
}): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-follow-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-follow-up error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { draft?: string };
  if (typeof data.draft !== "string" || !data.draft.trim()) {
    throw new Error("ai-follow-up returned an empty draft");
  }
  return data.draft.trim();
}

// ---------------------------------------------------------------------------
// detectAwaitingReply
// ---------------------------------------------------------------------------

/**
 * Find threads where the user sent the most recent message and no inbound reply
 * has been received after AWAIT_REPLY_DAYS days. Create follow_ups records for
 * any such threads not already tracked.
 *
 * "Sent" is detected by checking whether the message's sender matches one of
 * the user's account email addresses.
 */
export async function detectAwaitingReply(userId: string): Promise<number> {
  const admin = createAdminClient();

  // Get all the user's account email addresses
  const { data: accounts } = await admin
    .from("accounts")
    .select("id, email_address")
    .eq("user_id", userId);

  if (!accounts?.length) return 0;

  const accountEmailSet = new Set(
    (accounts as { id: string; email_address: string }[]).map((a) =>
      a.email_address.toLowerCase().trim(),
    ),
  );
  const accountIdMap = Object.fromEntries(
    (accounts as { id: string; email_address: string }[]).map((a) => [
      a.email_address.toLowerCase().trim(),
      a.id,
    ]),
  );

  // Threads with a last message older than AWAIT_REPLY_DAYS, not archived
  const cutoff = new Date(Date.now() - AWAIT_REPLY_DAYS * 86400_000).toISOString();

  const { data: threads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .lt("last_message_at", cutoff)
    .limit(50);

  if (!threads?.length) return 0;

  // Find threads already tracked in follow_ups to skip
  const threadIds = threads.map((t) => t.id as string);
  const { data: existingFollowUps } = await admin
    .from("follow_ups")
    .select("thread_id")
    .eq("user_id", userId)
    .in("thread_id", threadIds);

  const trackedThreadIds = new Set(
    (existingFollowUps ?? []).map((f) => f.thread_id as string),
  );

  let created = 0;

  for (const thread of threads) {
    const threadId = thread.id as string;
    if (trackedThreadIds.has(threadId)) continue;

    // Get messages in this thread sorted oldest-to-newest
    const { data: msgs } = await admin
      .from("messages")
      .select("id, account_id, sender, recipients, message_at")
      .eq("thread_id", threadId)
      .order("message_at", { ascending: true });

    if (!msgs?.length) continue;

    const typedMsgs = msgs as Pick<MessageRow, "id" | "account_id" | "sender" | "recipients" | "message_at">[];

    // The last message must be one sent by the user (outbound)
    const lastMsg = typedMsgs[typedMsgs.length - 1];
    const lastSenderEmail = extractEmailAddress(lastMsg.sender ?? "");
    if (!lastSenderEmail || !accountEmailSet.has(lastSenderEmail.toLowerCase())) {
      // Last message was inbound — thread already has a reply
      continue;
    }

    // Make sure there is at least one prior inbound message (thread must be a reply, not a cold send to self)
    const hasInboundMessage = typedMsgs.some((m) => {
      const senderEmail = extractEmailAddress(m.sender ?? "");
      return senderEmail && !accountEmailSet.has(senderEmail.toLowerCase());
    });
    if (!hasInboundMessage) continue;

    // Resolve account id for the last outbound message
    const accountId =
      (lastMsg.account_id as string | null) ??
      accountIdMap[lastSenderEmail.toLowerCase()];
    if (!accountId) continue;

    const nextFollowUpAt = new Date(Date.now()).toISOString(); // due immediately

    const { error: insertErr } = await admin.from("follow_ups").insert({
      user_id: userId,
      thread_id: threadId,
      account_id: accountId,
      original_message_id: lastMsg.id,
      follow_up_count: 0,
      next_follow_up_at: nextFollowUpAt,
      max_follow_ups: 3,
      status: "waiting",
    });

    if (!insertErr) {
      created++;
    } else {
      console.error(`Failed to create follow_up for thread ${threadId}:`, insertErr.message);
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// generateFollowUpDraft
// ---------------------------------------------------------------------------

/**
 * Generate an AI follow-up draft for a specific follow_up record.
 * Inserts the draft into the drafts table with source='ai'.
 * Returns the draft id on success.
 */
export async function generateFollowUpDraft(followUpId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: followUp, error: fErr } = await admin
    .from("follow_ups")
    .select("id, user_id, thread_id, account_id, original_message_id")
    .eq("id", followUpId)
    .maybeSingle();

  if (fErr || !followUp) {
    throw new Error(`follow_up ${followUpId} not found`);
  }

  const fu = followUp as FollowUpRow;

  // Load the thread subject
  const { data: thread } = await admin
    .from("threads")
    .select("subject, sender_email")
    .eq("id", fu.thread_id)
    .maybeSingle();

  const subject = (thread?.subject as string | null) ?? "(no subject)";
  const recipientEmail = (thread?.sender_email as string | null) ?? "";

  // Load the original outbound message body
  const { data: origMsg } = fu.original_message_id
    ? await admin
        .from("messages")
        .select("body_html, body_text")
        .eq("id", fu.original_message_id)
        .maybeSingle()
    : { data: null };

  const originalBody = origMsg
    ? (origMsg.body_text as string | null) ||
      (origMsg.body_html ? stripHtml(origMsg.body_html as string) : "")
    : "";

  // Generate via AI edge function
  const draftBody = await callFollowUpEdgeFunction({
    subject,
    originalBody: originalBody.slice(0, 2000),
    recipientEmail,
  });

  // Upsert into drafts table
  const { data: draft, error: dErr } = await admin
    .from("drafts")
    .insert({
      user_id: fu.user_id,
      thread_id: fu.thread_id,
      account_id: fu.account_id,
      subject: `Re: ${subject}`,
      body_text: draftBody,
      source: "ai",
      status: "draft",
    })
    .select("id")
    .single();

  if (dErr || !draft) {
    throw new Error(`Failed to insert follow-up draft: ${dErr?.message ?? "unknown"}`);
  }

  return draft.id as string;
}

// ---------------------------------------------------------------------------
// processFollowUpsDue
// ---------------------------------------------------------------------------

/**
 * Process all follow_up records that are due now for a given user.
 * For each:
 *  1. Check the thread hasn't already received a reply (mark 'replied' if so)
 *  2. Check max_follow_ups hasn't been exceeded (mark 'cancelled' if so)
 *  3. Generate an AI draft
 *  4. Increment follow_up_count and push next_follow_up_at by FOLLOW_UP_INTERVAL_DAYS
 *
 * This function is non-fatal: errors per record are logged and skipped.
 */
export async function processFollowUpsDue(
  userId?: string,
): Promise<{ processed: number; errors: number }> {
  const admin = createAdminClient();

  const now = new Date().toISOString();

  let query = admin
    .from("follow_ups")
    .select("id, user_id, thread_id, account_id, original_message_id, follow_up_count, max_follow_ups, next_follow_up_at")
    .eq("status", "waiting")
    .lte("next_follow_up_at", now)
    .limit(10);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: dueRows, error: qErr } = await query;
  if (qErr) {
    throw qErr;
  }

  let processed = 0;
  let errors = 0;

  for (const row of dueRows ?? []) {
    const fu = row as FollowUpRow;
    try {
      // Check whether a reply has arrived since we created the follow_up
      const { data: replyMsg } = await admin
        .from("messages")
        .select("id, sender")
        .eq("thread_id", fu.thread_id)
        .gt("message_at", fu.created_at)
        .limit(5);

      // Load account emails to distinguish inbound vs outbound
      const { data: accountRows } = await admin
        .from("accounts")
        .select("email_address")
        .eq("user_id", fu.user_id);

      const accountEmails = new Set(
        (accountRows ?? []).map((a) => (a.email_address as string).toLowerCase().trim()),
      );

      const hasReply = (replyMsg ?? []).some((m) => {
        const senderEmail = extractEmailAddress((m.sender as string | null) ?? "");
        return senderEmail && !accountEmails.has(senderEmail.toLowerCase());
      });

      if (hasReply) {
        await admin
          .from("follow_ups")
          .update({ status: "replied" })
          .eq("id", fu.id);
        processed++;
        continue;
      }

      // Check if max follow-ups reached
      if (fu.follow_up_count >= fu.max_follow_ups) {
        await admin
          .from("follow_ups")
          .update({ status: "cancelled" })
          .eq("id", fu.id);
        processed++;
        continue;
      }

      // Generate the AI draft
      await generateFollowUpDraft(fu.id);

      // Advance counters
      const nextAt = new Date(
        Date.now() + FOLLOW_UP_INTERVAL_DAYS * 86400_000,
      ).toISOString();
      await admin
        .from("follow_ups")
        .update({
          status: "followed_up",
          follow_up_count: fu.follow_up_count + 1,
          next_follow_up_at: nextAt,
        })
        .eq("id", fu.id);

      processed++;
    } catch (e) {
      console.error(`processFollowUpsDue failed for follow_up ${fu.id}:`, e);
      errors++;
    }
  }

  return { processed, errors };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractEmailAddress(fromHeader: string): string | null {
  if (!fromHeader) return null;
  const m = fromHeader.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  if (fromHeader.includes("@")) return fromHeader.trim();
  return null;
}
