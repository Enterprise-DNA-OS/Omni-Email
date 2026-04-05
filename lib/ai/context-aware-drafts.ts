/**
 * Context-Aware Drafts (Feature 6.2)
 *
 * Generates highly contextualised reply drafts by enriching the AI prompt with:
 *   - Full thread content (last 10 messages)
 *   - Contact record for the primary sender (relationship score, history)
 *   - Last 5 interaction threads with that contact
 *   - The user's writing style profile
 *   - Pending tasks involving this contact
 *   - Upcoming calendar events with this contact
 *
 * Calls the ai-context-draft Supabase Edge Function for the actual generation.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import { getStyleContext } from "@/lib/ai/tone-learning";
import {
  getRelevantKnowledge,
  formatKnowledgeForPrompt,
} from "@/lib/ai/knowledge-retrieval";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextAwareDraftResult {
  draft: string;
  suggestedNextSteps: string[];
}

interface ContactRecord {
  id: string;
  name: string | null;
  email: string;
  relationship_score: number | null;
  message_count_in: number;
  message_count_out: number;
  last_inbound_at: string | null;
  avg_response_time_hours: number | null;
}

interface InteractionThread {
  id: string;
  subject: string | null;
  snippet: string | null;
  last_message_at: string | null;
}

interface PendingTask {
  id: string;
  description: string;
  due_at: string | null;
  status: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
}

// ---------------------------------------------------------------------------
// Context gathering helpers
// ---------------------------------------------------------------------------

/** Extract the primary sender email from the most recent inbound message. */
function extractSenderEmail(fromHeader: string): string | null {
  if (!fromHeader) return null;
  const m = fromHeader.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  if (fromHeader.includes("@")) return fromHeader.trim().toLowerCase();
  return null;
}

// ---------------------------------------------------------------------------
// generateContextAwareDraft
// ---------------------------------------------------------------------------

/**
 * Build a rich context object and call the ai-context-draft edge function.
 *
 * @param threadId  - The thread to draft a reply for
 * @param accountId - The account used to send (determines writing style profile)
 * @param userId    - The owning user
 */
export async function generateContextAwareDraft(
  threadId: string,
  accountId: string,
  userId: string,
): Promise<ContextAwareDraftResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are not configured");
  }

  const admin = createAdminClient();

  // 1. Load thread metadata
  const { data: thread } = await admin
    .from("threads")
    .select("id, subject, sender_email, sender_name")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!thread) {
    throw new Error(`Context-aware draft: thread ${threadId} not found`);
  }

  const subject = (thread.subject as string | null) ?? "(no subject)";

  // 2. Load last 10 messages
  const { data: messages } = await admin
    .from("messages")
    .select("sender, body_text, body_html, message_at")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: true })
    .limit(10);

  const formattedMessages = (messages ?? []).map((m) => ({
    sender: (m.sender as string | null) ?? "Unknown",
    body: (
      (m.body_text as string | null) ||
      (m.body_html ? stripHtml(m.body_html as string) : "")
    ).slice(0, 1500),
    sentAt: (m.message_at as string) ?? "",
  }));

  // 3. Identify the primary external sender (most recent inbound message)
  const userAccounts = await admin
    .from("accounts")
    .select("email_address")
    .eq("user_id", userId);

  const userEmailSet = new Set(
    ((userAccounts.data ?? []) as { email_address: string }[]).map((a) =>
      a.email_address.toLowerCase(),
    ),
  );

  let primarySenderEmail: string | null = null;
  for (let i = formattedMessages.length - 1; i >= 0; i--) {
    const senderEmail = extractSenderEmail(formattedMessages[i].sender);
    if (senderEmail && !userEmailSet.has(senderEmail)) {
      primarySenderEmail = senderEmail;
      break;
    }
  }

  // Fall back to thread.sender_email
  if (!primarySenderEmail) {
    primarySenderEmail = extractSenderEmail((thread.sender_email as string | null) ?? "");
  }

  // 4. Load contact record
  let contact: ContactRecord | null = null;
  if (primarySenderEmail) {
    const { data: contactRow } = await admin
      .from("contacts")
      .select(
        "id, name, email, relationship_score, message_count_in, message_count_out, last_inbound_at, avg_response_time_hours",
      )
      .eq("user_id", userId)
      .eq("email", primarySenderEmail)
      .maybeSingle();

    if (contactRow) {
      contact = contactRow as ContactRecord;
    }
  }

  // 5. Load last 5 other threads with this contact
  let recentInteractions: InteractionThread[] = [];
  if (primarySenderEmail) {
    const { data: relatedThreads } = await admin
      .from("threads")
      .select("id, subject, snippet, last_message_at")
      .eq("user_id", userId)
      .eq("sender_email", primarySenderEmail)
      .neq("id", threadId)
      .order("last_message_at", { ascending: false })
      .limit(5);

    recentInteractions = (relatedThreads ?? []).map((t) => ({
      id: t.id as string,
      subject: (t.subject as string | null) ?? "(no subject)",
      snippet: t.snippet
        ? stripHtml(t.snippet as string).slice(0, 200)
        : null,
      last_message_at: t.last_message_at as string | null,
    }));
  }

  // 6. Load writing style profile for the sending account
  const writingStyleProfile = await getStyleContext(accountId).catch(() => null);

  // 6b. Load relevant knowledge base entries for this email context
  const lastMessage = formattedMessages[formattedMessages.length - 1];
  const knowledgeEntries = await getRelevantKnowledge(userId, {
    senderEmail: primarySenderEmail,
    senderDomain: primarySenderEmail?.split("@")[1] ?? null,
    subject: subject !== "(no subject)" ? subject : null,
    body: lastMessage?.body ?? null,
  }).catch(() => []);
  const knowledgeContext = formatKnowledgeForPrompt(knowledgeEntries);

  // 7. Load pending tasks that mention this contact's email domain or name
  let pendingTasks: PendingTask[] = [];
  if (primarySenderEmail) {
    const domain = primarySenderEmail.split("@")[1] ?? "";
    const senderName = contact?.name ?? "";

    const { data: tasks } = await admin
      .from("tasks")
      .select("id, description, due_at, status")
      .eq("user_id", userId)
      .neq("status", "done")
      .or(
        [
          domain ? `description.ilike.%${domain}%` : null,
          senderName ? `description.ilike.%${senderName}%` : null,
          `description.ilike.%${primarySenderEmail}%`,
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(5);

    pendingTasks = ((tasks ?? []) as PendingTask[]).map((t) => ({
      id: t.id,
      description: t.description,
      due_at: t.due_at,
      status: t.status,
    }));
  }

  // 8. Load upcoming calendar events with this contact (next 7 days)
  let upcomingEvents: UpcomingEvent[] = [];
  if (primarySenderEmail) {
    const now = new Date().toISOString();
    const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events } = await admin
      .from("events")
      .select("id, title, start_at, end_at")
      .eq("user_id", userId)
      .gte("start_at", now)
      .lte("start_at", inAWeek)
      .ilike("title", `%${primarySenderEmail.split("@")[0]}%`) // best-effort match
      .limit(3);

    upcomingEvents = ((events ?? []) as UpcomingEvent[]).map((e) => ({
      id: e.id,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at ?? null,
    }));
  }

  // 9. Call the ai-context-draft edge function
  const payload = {
    subject,
    messages: formattedMessages,
    contact,
    recentInteractions,
    writingStyleProfile,
    knowledgeContext: knowledgeContext || null,
    pendingTasks,
    upcomingEvents,
    senderEmail: primarySenderEmail,
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-context-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-context-draft error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    draft?: string;
    suggestedNextSteps?: string[];
  };

  if (!data.draft) {
    throw new Error("ai-context-draft returned an empty draft");
  }

  return {
    draft: data.draft.trim(),
    suggestedNextSteps: data.suggestedNextSteps ?? [],
  };
}
