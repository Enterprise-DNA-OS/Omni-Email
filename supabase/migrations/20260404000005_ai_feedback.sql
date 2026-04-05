CREATE TABLE public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('classification','draft','action')),
  ai_output jsonb NOT NULL DEFAULT '{}',
  user_correction jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_feedback_user ON public.ai_feedback(user_id, created_at DESC);
CREATE INDEX idx_ai_feedback_thread ON public.ai_feedback(thread_id) WHERE thread_id IS NOT NULL;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_feedback_select ON public.ai_feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_feedback_insert ON public.ai_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT ON public.ai_feedback TO authenticated;
GRANT ALL ON public.ai_feedback TO service_role;
