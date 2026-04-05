-- Rules Engine: user-defined condition/action automation rules
-- Conditions: [{ field, operator, value, logic }]
-- Actions:    [{ type, params }]

CREATE TABLE public.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]',
  actions jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  match_count integer NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Primary query: fetch enabled rules for a user ordered by priority
CREATE INDEX idx_rules_user_enabled ON public.rules(user_id, enabled, priority DESC);

-- Allow searching by name
CREATE INDEX idx_rules_user_name ON public.rules(user_id, name);

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

-- Users can fully manage their own rules; no cross-user access
CREATE POLICY rules_all ON public.rules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO authenticated;
GRANT ALL ON public.rules TO service_role;

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.set_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rules_updated_at
  BEFORE UPDATE ON public.rules
  FOR EACH ROW EXECUTE FUNCTION public.set_rules_updated_at();

-- Add a column to threads to track whether rules have been evaluated,
-- so the engine can skip re-processing already-processed threads.
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS rules_processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_threads_rules_unprocessed
  ON public.threads (user_id, last_message_at DESC)
  WHERE rules_processed_at IS NULL AND ai_processed_at IS NOT NULL AND archived_at IS NULL;
