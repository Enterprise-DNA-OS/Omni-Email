-- Auto-Unsubscribe (Feature 2.3)
-- Adds list_unsubscribe + is_newsletter to threads, and creates unsubscribe_log

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS list_unsubscribe text,
  ADD COLUMN IF NOT EXISTS is_newsletter boolean DEFAULT false;

CREATE TABLE public.unsubscribe_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text,
  sender_domain text,
  method text CHECK (method IN ('mailto', 'https', 'list-unsubscribe-post', 'manual')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed', 'failed')),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_unsubscribe_user ON public.unsubscribe_log(user_id, sender_domain);

ALTER TABLE public.unsubscribe_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY unsubscribe_log_select ON public.unsubscribe_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.unsubscribe_log TO authenticated;
GRANT ALL ON public.unsubscribe_log TO service_role;
