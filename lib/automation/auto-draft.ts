/**
 * Auto-draft generation — Feature 2.7
 *
 * Finds threads classified with reply/reply_urgent intent and generates
 * AI-drafted replies, storing them in the drafts table with source='ai'.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const VALID_TONES = [
  "professional",
  "friendly",
  "brief",
  "concise",
  "warm",
  "executive",
  "support",
  "sales",
  "legal_safe",
  "detailed",
  "casual",
] as const;

type Tone = (typeof VALID_TONES)[number];

interface ThreadRow {
  id: string;
  subject: string | null;
  user_id: string;
  primary_account_id: string | null;
}

interface MessageRow {
  sender: string | null;
  body_html: string | null;
  body_text: string | null;
  message_at: string | null;
}

/**
 * Call the ai-suggest-reply edge function and return the draft body text.
 */
async function callSuggestReplyEdgeFunction(
  subject: string,
  messages: { sender: string; body: string }[],
  tone: Tone,
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-suggest-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ subject, messages, tone }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-suggest-reply error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { reply?: string };
  if (!data.reply) {
    throw new Error("ai-suggest-reply returned empty reply");
  }
  return data.reply;
}

/**
 * Generate an AI draft reply for a single thread and insert it into the
 * drafts table with source='ai'. Returns the new draft id.
 */
export async function generateDraftForThread(
  threadId: string,
  userId: string,
  tone: Tone = "professional",
): Promise<string> {
  const admin = createAdminClient();

  const { data: thread, error: tErr } = await admin
    .from("threads")
    .select("id, subject, user_id, primary_account_id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (tErr || !thread) {
    throw new Error(`Thread ${threadId} not found for user ${userId}`);
  }

  const t = thread as ThreadRow;

  if (!t.primary_account_id) {
    throw new Error(`Thread ${threadId} has no primary_account_id`);
  }

  const { data: messages } = await admin
    .from("messages")
    .select("sender, body_html, body_text, message_at")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: true })
    .limit(10);

  const formattedMessages = (messages ?? []).map((m: MessageRow) => ({
    sender: (m.sender as string) ?? "Unknown",
    body: (
      (m.body_text as string) ||
      (m.body_html ? stripHtml(m.body_html as string) : "")
    ).slice(0, 2000),
  }));

  const subject = (t.subject as string | null) ?? "(no subject)";
  const draftBody = await callSuggestReplyEdgeFunction(subject, formattedMessages, tone);

  // Determine the reply-to address from the last message sender
  const lastMessage = formattedMessages[formattedMessages.length - 1];
  const toRecipients = lastMessage ? [{ address: lastMessage.sender }] : [];

  const replySubject = subject.toLowerCase().startsWith("re:")
    ? subject
    : `Re: ${subject}`;

  const { data: inserted, error: iErr } = await admin
    .from("drafts")
    .insert({
      user_id: userId,
      account_id: t.primary_account_id as string,
      thread_id: threadId,
      to_recipients: toRecipients,
      cc_recipients: [],
      bcc_recipients: [],
      subject: replySubject,
      body_text: draftBody,
      body_html: null,
      tone,
      source: "ai",
      status: "draft",
    })
    .select("id")
    .single();

  if (iErr || !inserted) {
    throw new Error(`Failed to insert draft: ${iErr?.message ?? "unknown"}`);
  }

  return inserted.id as string;
}

/**
 * Process auto-drafts for a user. Finds threads with reply/reply_urgent
 * intent that have no existing active draft yet, and generates AI drafts for
 * up to `limit` of them. Non-fatal: errors on individual threads are logged
 * and skipped.
 */
export async function processAutoDrafts(
  userId: string,
  limit = 3,
): Promise<{ drafted: number; errors: number }> {
  const admin = createAdminClient();

  // Step 1: fetch thread IDs that already have an active or sent draft.
  // The Supabase JS client does not support passing a query builder as a subquery
  // to .not("id", "in", ...), so we do a two-step approach to avoid that pattern.
  const { data: existingDraftRows } = await admin
    .from("drafts")
    .select("thread_id")
    .eq("user_id", userId)
    .in("status", ["draft", "sent"]);

  const threadIdsWithDraft = (existingDraftRows ?? []).map((r) => r.thread_id as string);

  // Step 2: find reply-intent threads that are active and have no existing draft
  const fetchLimit = Math.min(limit + threadIdsWithDraft.length, limit * 10);
  let threadsQuery = admin
    .from("threads")
    .select("id")
    .eq("user_id", userId)
    .in("ai_intent", ["reply", "reply_urgent"])
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(fetchLimit); // over-fetch so we still get `limit` after filtering out drafted threads

  const { data: threadCandidates } = await threadsQuery;

  // Exclude threads that already have an active draft (filter in memory)
  const withDraftSet = new Set(threadIdsWithDraft);
  const threads = (threadCandidates ?? [])
    .filter((t) => !withDraftSet.has(t.id as string))
    .slice(0, limit);

  let drafted = 0;
  let errors = 0;

  for (const t of threads ?? []) {
    try {
      await generateDraftForThread(t.id as string, userId);
      drafted++;
    } catch (e) {
      console.error(`Auto-draft failed for thread ${t.id as string}:`, e);
      errors++;
    }
  }

  return { drafted, errors };
}
