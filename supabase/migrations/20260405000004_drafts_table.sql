CREATE TABLE public.drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  to_recipients jsonb NOT NULL DEFAULT '[]',
  cc_recipients jsonb NOT NULL DEFAULT '[]',
  bcc_recipients jsonb NOT NULL DEFAULT '[]',
  subject text,
  body_html text,
  body_text text,
  tone text DEFAULT 'professional',
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drafts_user_thread ON public.drafts(user_id, thread_id, status);
CREATE INDEX idx_drafts_user_status ON public.drafts(user_id, status, updated_at DESC);

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY drafts_all ON public.drafts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drafts TO authenticated;
GRANT ALL ON public.drafts TO service_role;
