/**
 * Action item extraction — Feature 5.3
 *
 * Extracts tasks and action items from email threads using AI, deduplicates
 * against existing tasks, and inserts new ones into the tasks table.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface ExtractedTask {
  description: string;
  deadline: string | null;
  assignee: string | null;
}

interface MessageRow {
  id: string;
  sender: string | null;
  body_html: string | null;
  body_text: string | null;
  message_at: string | null;
}

interface ExistingTask {
  description: string;
}

/**
 * Call the ai-extract-tasks edge function.
 * Returns a raw JSON array of extracted task objects.
 */
async function callExtractTasksEdgeFunction(
  subject: string,
  messages: { sender: string; body: string }[],
): Promise<ExtractedTask[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-extract-tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ subject, messages }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-extract-tasks error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { tasks?: ExtractedTask[] };
  if (!Array.isArray(data.tasks)) {
    return [];
  }

  return data.tasks
    .filter((item): item is ExtractedTask => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.description === "string" &&
        item.description.trim().length > 0
      );
    })
    .map((item) => ({
      description: item.description.trim(),
      deadline: typeof item.deadline === "string" ? item.deadline : null,
      assignee: typeof item.assignee === "string" ? item.assignee.trim() || null : null,
    }));
}

/**
 * Normalize a description for deduplication comparison.
 * Lowercase, collapse whitespace, strip punctuation.
 */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract action items from a single thread. Deduplicates against tasks
 * already stored for the thread. Marks the thread with tasks_extracted_at.
 * Returns the number of new tasks inserted.
 */
export async function extractTasksFromThread(
  threadId: string,
  userId: string,
): Promise<number> {
  const admin = createAdminClient();

  const { data: thread, error: tErr } = await admin
    .from("threads")
    .select("id, subject, user_id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (tErr || !thread) {
    throw new Error(`Thread ${threadId} not found for user ${userId}`);
  }

  const { data: messages } = await admin
    .from("messages")
    .select("id, sender, body_html, body_text, message_at")
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

  const subject = (thread.subject as string | null) ?? "(no subject)";

  const extracted = await callExtractTasksEdgeFunction(subject, formattedMessages);

  // Fetch existing tasks for this thread to deduplicate
  const { data: existingTasks } = await admin
    .from("tasks")
    .select("description")
    .eq("user_id", userId)
    .eq("thread_id", threadId);

  const existingNormalized = new Set(
    (existingTasks ?? []).map((et: ExistingTask) =>
      normalizeDescription(et.description as string),
    ),
  );

  // Get the first message id as a weak reference for source tracking
  const firstMessageId =
    messages && messages.length > 0 ? (messages[0] as MessageRow).id : null;

  let inserted = 0;
  for (const task of extracted) {
    const norm = normalizeDescription(task.description);
    if (existingNormalized.has(norm)) {
      continue;
    }
    existingNormalized.add(norm);

    const { error: iErr } = await admin.from("tasks").insert({
      user_id: userId,
      thread_id: threadId,
      message_id: firstMessageId,
      description: task.description,
      deadline: task.deadline ?? null,
      assignee: task.assignee ?? null,
      status: "pending",
      source: "ai_extracted",
    });

    if (!iErr) {
      inserted++;
    } else {
      console.error(`Failed to insert task for thread ${threadId}:`, iErr.message);
    }
  }

  // Mark thread as processed regardless of how many tasks were found
  await admin
    .from("threads")
    .update({ tasks_extracted_at: new Date().toISOString() })
    .eq("id", threadId);

  return inserted;
}

/**
 * Extract tasks for a batch of recently classified threads that have not yet
 * been processed. Skips threads already marked with tasks_extracted_at.
 * Non-fatal: errors per thread are logged and skipped.
 */
export async function extractTasksForUser(
  userId: string,
  limit = 3,
): Promise<{ processed: number; errors: number }> {
  const admin = createAdminClient();

  // Target threads that have been AI-classified but not yet had tasks extracted
  const { data: threads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("tasks_extracted_at", null)
    .not("ai_processed_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  let processed = 0;
  let errors = 0;

  for (const t of threads ?? []) {
    try {
      await extractTasksFromThread(t.id as string, userId);
      processed++;
    } catch (e) {
      console.error(`Task extraction failed for thread ${t.id as string}:`, e);
      errors++;
    }
  }

  return { processed, errors };
}
