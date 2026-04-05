/**
 * Semantic search over the user's inbox using pgvector cosine similarity.
 *
 * Flow:
 *   1. Generate a query embedding via the ai-embeddings edge function
 *   2. Run a vector similarity query via Supabase RPC
 *   3. Return ranked results with thread context
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/ai/embeddings";

export interface SemanticSearchResult {
  message_id: string;
  thread_id: string;
  subject: string;
  sender: string;
  sender_name: string | null;
  snippet: string;
  message_body: string;
  similarity: number;
  last_message_at: string | null;
}

/**
 * Search the user's inbox semantically.
 *
 * Generates an embedding for the query, then finds the most similar messages
 * using cosine similarity against stored message_embeddings.
 *
 * @param userId  - The authenticated user's ID (used to scope results to their threads)
 * @param query   - Natural language search query
 * @param limit   - Max results to return (default 20)
 */
export async function semanticSearch(
  userId: string,
  query: string,
  limit = 20,
): Promise<SemanticSearchResult[]> {
  const admin = createAdminClient();

  // 1. Embed the query
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // 2. Similarity search via raw SQL through RPC
  // We use a Postgres function (defined below) or fall back to a direct query.
  // Since we can't always guarantee the RPC function exists, we use the JS client's
  // ability to call rpc with a fallback to a direct select if needed.
  const { data, error } = await admin.rpc("semantic_search_messages", {
    p_user_id: userId,
    p_embedding: vectorStr,
    p_limit: limit,
  });

  if (error) {
    // If the RPC doesn't exist yet (migration not applied), surface the error clearly
    if (error.message?.includes("function") || error.code === "42883") {
      throw new Error(
        "Semantic search RPC not available. Ensure migration 20260406000003_semantic_search.sql has been applied and the search function created.",
      );
    }
    throw error;
  }

  return (data ?? []) as SemanticSearchResult[];
}

/**
 * SQL for the semantic_search_messages Postgres function.
 * This should be included in a migration. Provided here as reference.
 *
 * CREATE OR REPLACE FUNCTION semantic_search_messages(
 *   p_user_id uuid,
 *   p_embedding vector(1536),
 *   p_limit int DEFAULT 20
 * )
 * RETURNS TABLE (
 *   message_id uuid,
 *   thread_id uuid,
 *   subject text,
 *   sender text,
 *   sender_name text,
 *   snippet text,
 *   message_body text,
 *   similarity float,
 *   last_message_at timestamptz
 * )
 * LANGUAGE sql STABLE
 * AS $$
 *   SELECT
 *     m.id AS message_id,
 *     t.id AS thread_id,
 *     t.subject,
 *     m.sender,
 *     t.sender_name,
 *     t.snippet,
 *     COALESCE(m.body_text, '') AS message_body,
 *     1 - (me.embedding <=> p_embedding) AS similarity,
 *     t.last_message_at
 *   FROM message_embeddings me
 *   JOIN messages m ON m.id = me.message_id
 *   JOIN threads t ON t.id = m.thread_id
 *   WHERE t.user_id = p_user_id
 *     AND t.archived_at IS NULL
 *   ORDER BY me.embedding <=> p_embedding
 *   LIMIT p_limit;
 * $$;
 */
