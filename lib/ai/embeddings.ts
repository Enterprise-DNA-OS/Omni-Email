/**
 * Embedding utilities for semantic search.
 *
 * Calls the ai-embeddings Supabase Edge Function, which uses OpenRouter's
 * embeddings endpoint (text-embedding-3-small, 1536 dimensions).
 * Embeddings are stored in message_embeddings and retrieved for cosine similarity search.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Max characters sent to the embedding model (~6000 chars ≈ ~1500 tokens, well within limits)
const MAX_EMBEDDING_CHARS = 6000;

function embeddingEdgeFunctionUrl(): string {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${SUPABASE_URL}/functions/v1/ai-embeddings`;
}

/**
 * Call the ai-embeddings edge function with a batch of texts.
 * Returns one embedding vector per input text.
 */
async function callEmbeddingsFunction(texts: string[]): Promise<number[][]> {
  if (!SUPABASE_ANON_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

  const res = await fetch(embeddingEdgeFunctionUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ texts }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embeddings service error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { embeddings?: number[][]; error?: string };
  if (json.error) throw new Error(json.error);
  if (
    !Array.isArray(json.embeddings) ||
    json.embeddings.length !== texts.length ||
    json.embeddings.some((embedding) => !Array.isArray(embedding))
  ) {
    throw new Error("Embeddings response is malformed");
  }

  return json.embeddings;
}

/**
 * Generate a single embedding vector for a text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await callEmbeddingsFunction([text]);
  return embedding;
}

/**
 * Find messages for a user that do not yet have embeddings and generate them in batches.
 * Called after each sync cycle so new messages are indexed quickly.
 */
export async function embedUnprocessedMessages(
  userId: string,
  limit = 10,
): Promise<void> {
  const admin = createAdminClient();

  // Get thread ids for this user first — all subsequent queries are scoped to these
  const { data: threads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  if (!threads || threads.length === 0) return;

  const threadIds = threads.map((t) => t.id as string);

  // Find messages in this user's threads that lack an embedding row.
  // We scope the already-embedded query to this user's message IDs to avoid
  // pulling the entire message_embeddings table globally.
  // First, fetch a candidate set of recent messages for this user's threads.
  const { data: candidateMessages, error: fetchError } = await admin
    .from("messages")
    .select("id, sender, body_text, body_html")
    .in("thread_id", threadIds)
    .order("message_at", { ascending: false })
    .limit(limit * 5); // over-fetch so we still have `limit` after excluding embedded ones

  if (fetchError) {
    throw fetchError;
  }

  const candidateIds = (candidateMessages ?? []).map((m) => m.id as string);

  // Now fetch only the embedding rows that belong to this user's candidate messages
  const { data: embeddedIds } = candidateIds.length > 0
    ? await admin
        .from("message_embeddings")
        .select("message_id")
        .in("message_id", candidateIds)
    : { data: [] };

  const embeddedSet = new Set<string>(
    (embeddedIds ?? []).map((r) => r.message_id as string),
  );

  const unembedded = (candidateMessages ?? [])
    .filter((m) => !embeddedSet.has(m.id as string))
    .slice(0, limit);

  if (unembedded.length === 0) return;

  // Prepare texts for batch embedding
  const texts = unembedded.map((m) => {
    const rawBody =
      (m.body_text as string | null) ?? stripHtml((m.body_html as string | null) ?? "");
    return [`From: ${(m.sender as string | null) ?? ""}`, rawBody]
      .join("\n")
      .slice(0, MAX_EMBEDDING_CHARS);
  });

  // Call embeddings in one batch (up to 20 at a time per edge function limit)
  const BATCH_SIZE = 20;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const ids = unembedded.slice(i, i + BATCH_SIZE).map((m) => m.id as string);

    const embeddings = await callEmbeddingsFunction(batch);

    const upsertRows = ids.map((id, idx) => ({
      message_id: id,
      embedding: `[${embeddings[idx].join(",")}]`,
    }));

    const { error: upsertError } = await admin
      .from("message_embeddings")
      .upsert(upsertRows, { onConflict: "message_id" });

    if (upsertError) {
      // Non-fatal per message: log and continue
      console.error("Failed to upsert embeddings batch:", upsertError);
    }
  }
}
