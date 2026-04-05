-- Enable pgvector extension for embedding storage and similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Store per-message embeddings (text-embedding-3-small produces 1536-dim vectors)
CREATE TABLE public.message_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id)
);

-- IVFFlat index for approximate cosine-similarity search
-- lists=100 is appropriate for a few hundred thousand rows; revisit at scale
CREATE INDEX idx_message_embeddings_ivfflat ON public.message_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Only service_role can write embeddings (generated server-side)
ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read embeddings for messages in their threads
CREATE POLICY embeddings_select ON public.message_embeddings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.threads t ON t.id = m.thread_id
      WHERE m.id = message_embeddings.message_id
        AND t.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.message_embeddings TO authenticated;
GRANT ALL ON public.message_embeddings TO service_role;

-- Semantic search function: returns messages ranked by cosine similarity to a query embedding.
-- Called from lib/ai/semantic-search.ts via supabase.rpc('semantic_search_messages', ...)
CREATE OR REPLACE FUNCTION public.semantic_search_messages(
  p_user_id uuid,
  p_embedding vector(1536),
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  message_id uuid,
  thread_id uuid,
  subject text,
  sender text,
  sender_name text,
  snippet text,
  message_body text,
  similarity float,
  last_message_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT
    m.id              AS message_id,
    t.id              AS thread_id,
    t.subject,
    m.sender,
    t.sender_name,
    t.snippet,
    COALESCE(m.body_text, '') AS message_body,
    1 - (me.embedding <=> p_embedding) AS similarity,
    t.last_message_at
  FROM public.message_embeddings me
  JOIN public.messages m ON m.id = me.message_id
  JOIN public.threads  t ON t.id = m.thread_id
  WHERE t.user_id   = p_user_id
    AND t.archived_at IS NULL
  ORDER BY me.embedding <=> p_embedding
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.semantic_search_messages TO authenticated, service_role;
