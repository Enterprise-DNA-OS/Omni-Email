CREATE TABLE public.daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  content jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, summary_date)
);

CREATE INDEX idx_daily_summaries_user_date ON public.daily_summaries(user_id, summary_date DESC);

ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_summaries_select ON public.daily_summaries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.daily_summaries TO authenticated;
GRANT ALL ON public.daily_summaries TO service_role;
