-- Add ai_intent, ai_confidence, and ai_reasoning columns to threads.
-- These fields are populated by the updated ai-classify edge function
-- which now returns actionable intent alongside the existing classification.

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS ai_intent     text
    CHECK (ai_intent IN (
      'reply', 'reply_urgent', 'archive', 'delete', 'delegate',
      'schedule', 'pay', 'review', 'ignore', 'unsubscribe',
      'follow_up', 'no_action'
    )),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(4,3)
    CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  ADD COLUMN IF NOT EXISTS ai_reasoning  text;

-- Index for filtering by intent (e.g. "show me everything I need to reply to")
CREATE INDEX IF NOT EXISTS idx_threads_ai_intent
  ON threads (ai_intent) WHERE ai_intent IS NOT NULL;

-- Index for low-confidence threads that might need re-classification
CREATE INDEX IF NOT EXISTS idx_threads_ai_confidence
  ON threads (ai_confidence) WHERE ai_confidence IS NOT NULL;
