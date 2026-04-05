-- Inbox Health Dashboard: daily analytics aggregates per user

CREATE TABLE IF NOT EXISTS public.analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  emails_received integer DEFAULT 0,
  emails_sent integer DEFAULT 0,
  emails_auto_archived integer DEFAULT 0,
  emails_auto_deleted integer DEFAULT 0,
  avg_response_time_minutes numeric(10,2),
  ai_drafts_accepted integer DEFAULT 0,
  ai_drafts_edited integer DEFAULT 0,
  ai_drafts_discarded integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Index for range queries (user dashboard fetching 7d/30d/90d)
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user_date
  ON public.analytics_daily(user_id, date DESC);

-- RLS: users read their own rows only; service_role writes via aggregation jobs
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_daily_select ON public.analytics_daily
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Grants
GRANT SELECT ON public.analytics_daily TO authenticated;
GRANT ALL ON public.analytics_daily TO service_role;
