-- Fix schema issues found in quality audit
-- 1. follow_ups.original_message_id FK missing ON DELETE clause
-- 2. threads.starred_at column missing
-- 3. accounts.ai_personality column missing
-- 4. approval_queue.confidence precision mismatch (numeric(3,2) → numeric(4,3))
-- 5. Missing formal RLS INSERT/UPDATE policies for service_role-only write tables
-- 6. follow_ups.thread_id FK cascade (already CASCADE, but explicit re-declaration for clarity)
-- 7. drafts.thread_id FK confirmed CASCADE; behavior_signals.thread_id confirmed SET NULL

-- ============================================================
-- CRITICAL FIX 1: follow_ups.original_message_id ON DELETE SET NULL
-- The original constraint has no ON DELETE clause, meaning a message
-- delete will raise an FK violation. Recreate with SET NULL.
-- ============================================================

ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_original_message_id_fkey;

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_original_message_id_fkey
    FOREIGN KEY (original_message_id)
    REFERENCES public.messages(id)
    ON DELETE SET NULL;

-- ============================================================
-- CRITICAL FIX 6 (related): follow_ups.thread_id
-- The existing constraint is ON DELETE CASCADE which is correct.
-- Re-declare to make it explicit and resilient to any future schema dumps.
-- ============================================================

ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_thread_id_fkey;

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_thread_id_fkey
    FOREIGN KEY (thread_id)
    REFERENCES public.threads(id)
    ON DELETE CASCADE;

-- ============================================================
-- CRITICAL FIX 2: threads.starred_at column missing
-- ============================================================

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS starred_at timestamptz;

-- Index for starred threads queries (user fetches their starred items)
CREATE INDEX IF NOT EXISTS idx_threads_starred
  ON public.threads(user_id, starred_at DESC)
  WHERE starred_at IS NOT NULL;

-- ============================================================
-- CRITICAL FIX 3: accounts.ai_personality column missing
-- Stores per-account AI tone/persona configuration as jsonb.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS ai_personality jsonb DEFAULT '{}';

-- ============================================================
-- CRITICAL FIX 4: approval_queue.confidence precision mismatch
-- threads.ai_confidence is numeric(4,3) (values like 0.123).
-- approval_queue.confidence is numeric(3,2) (values like 0.12).
-- Widen to numeric(4,3) so they are comparable without loss.
-- This is a safe widening — no existing data is truncated.
-- ============================================================

ALTER TABLE public.approval_queue
  ALTER COLUMN confidence TYPE numeric(4,3);

-- ============================================================
-- WARNING FIX 5a: audit_log — add INSERT policy for service_role
-- audit_log is written exclusively by the admin client (service_role).
-- Adding an explicit INSERT policy documents the intent clearly.
-- The existing GRANT ALL TO service_role already permits the writes.
-- ============================================================

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ============================================================
-- WARNING FIX 5b: approval_queue — add INSERT and UPDATE policies
-- for service_role (AI agent writes proposals; users only read/resolve).
-- ============================================================

DROP POLICY IF EXISTS approval_queue_insert ON public.approval_queue;
CREATE POLICY approval_queue_insert ON public.approval_queue
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS approval_queue_update ON public.approval_queue;
CREATE POLICY approval_queue_update ON public.approval_queue
  FOR UPDATE TO service_role
  USING (true);

-- ============================================================
-- WARNING FIX 5c: unsubscribe_log — add INSERT and UPDATE policies
-- for service_role (unsubscribe background job writes these rows).
-- ============================================================

DROP POLICY IF EXISTS unsubscribe_log_insert ON public.unsubscribe_log;
CREATE POLICY unsubscribe_log_insert ON public.unsubscribe_log
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS unsubscribe_log_update ON public.unsubscribe_log;
CREATE POLICY unsubscribe_log_update ON public.unsubscribe_log
  FOR UPDATE TO service_role
  USING (true);

-- ============================================================
-- WARNING FIX 5d: contact_interactions — add INSERT policy
-- for service_role (relationship intelligence pipeline writes these).
-- ============================================================

DROP POLICY IF EXISTS contact_interactions_insert ON public.contact_interactions;
CREATE POLICY contact_interactions_insert ON public.contact_interactions
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ============================================================
-- WARNING FIX 5e: daily_summaries — add INSERT and UPDATE policies
-- for service_role (AI summarization job writes these rows).
-- ============================================================

DROP POLICY IF EXISTS daily_summaries_insert ON public.daily_summaries;
CREATE POLICY daily_summaries_insert ON public.daily_summaries
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS daily_summaries_update ON public.daily_summaries;
CREATE POLICY daily_summaries_update ON public.daily_summaries
  FOR UPDATE TO service_role
  USING (true);

-- ============================================================
-- WARNING FIX 5f: analytics_daily — add INSERT and UPDATE policies
-- for service_role (aggregation job writes these rows via UPSERT).
-- ============================================================

DROP POLICY IF EXISTS analytics_daily_insert ON public.analytics_daily;
CREATE POLICY analytics_daily_insert ON public.analytics_daily
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS analytics_daily_update ON public.analytics_daily;
CREATE POLICY analytics_daily_update ON public.analytics_daily
  FOR UPDATE TO service_role
  USING (true);

-- ============================================================
-- Comments documenting intent for future maintainers
-- ============================================================

COMMENT ON COLUMN public.threads.starred_at IS
  'Timestamp when the thread was starred by the user. NULL means not starred. Used for starred inbox filter.';

COMMENT ON COLUMN public.accounts.ai_personality IS
  'Per-account AI tone and persona configuration. Shape: { tone: string, style: string, signature: string, ... }';

COMMENT ON COLUMN public.approval_queue.confidence IS
  'AI confidence score for the proposed action (0.000 – 1.000, matching threads.ai_confidence precision).';

COMMENT ON CONSTRAINT follow_ups_original_message_id_fkey ON public.follow_ups IS
  'SET NULL so deleting the original sent message does not cascade-delete the follow-up tracker.';
