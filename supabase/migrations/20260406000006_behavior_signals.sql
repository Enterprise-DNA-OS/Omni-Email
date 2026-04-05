-- Feature 4.2: Behavioral Learning
-- Tracks implicit user signals for pattern detection and rule suggestion

CREATE TABLE public.behavior_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('read','archived','deleted','replied','ignored','opened','snoozed')),
  time_to_action_seconds integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_behavior_signals_user ON public.behavior_signals(user_id, created_at DESC);
CREATE INDEX idx_behavior_signals_type ON public.behavior_signals(user_id, signal_type);

ALTER TABLE public.behavior_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY behavior_signals_insert ON public.behavior_signals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY behavior_signals_select ON public.behavior_signals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT ON public.behavior_signals TO authenticated;
GRANT ALL ON public.behavior_signals TO service_role;
