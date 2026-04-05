CREATE TABLE public.sender_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_or_domain text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('vip', 'safe', 'blocked', 'never_auto_send')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_or_domain, classification)
);
CREATE INDEX idx_sender_classifications_user ON public.sender_classifications(user_id, classification);
CREATE INDEX idx_sender_classifications_lookup ON public.sender_classifications(user_id, email_or_domain);
ALTER TABLE public.sender_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY sender_classifications_all ON public.sender_classifications
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_classifications TO authenticated;
GRANT ALL ON public.sender_classifications TO service_role;
