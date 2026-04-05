-- Add AI intelligence columns to threads for agent-driven email processing
-- These columns are populated by the AI classification pipeline after sync

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS sender_name    text,
  ADD COLUMN IF NOT EXISTS sender_email   text,
  ADD COLUMN IF NOT EXISTS ai_summary     text,
  ADD COLUMN IF NOT EXISTS ai_category    text,
  ADD COLUMN IF NOT EXISTS ai_priority    text        DEFAULT 'normal'
    CHECK (ai_priority IN ('urgent', 'high', 'normal', 'low', 'ignore')),
  ADD COLUMN IF NOT EXISTS ai_tags        jsonb       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;

-- Index for filtering by priority and category
CREATE INDEX IF NOT EXISTS idx_threads_ai_priority
  ON threads (ai_priority) WHERE ai_priority IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_ai_category
  ON threads (ai_category) WHERE ai_category IS NOT NULL;

-- Index for finding unprocessed threads
CREATE INDEX IF NOT EXISTS idx_threads_ai_unprocessed
  ON threads (last_message_at DESC)
  WHERE ai_processed_at IS NULL AND archived_at IS NULL;

-- GIN index for AI tags array queries
CREATE INDEX IF NOT EXISTS idx_threads_ai_tags
  ON threads USING gin (ai_tags);
