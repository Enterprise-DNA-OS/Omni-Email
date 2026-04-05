CREATE TABLE public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  to_recipients jsonb NOT NULL DEFAULT '[]',
  cc jsonb DEFAULT '[]',
  bcc jsonb DEFAULT '[]',
  subject text,
  body_html text,
  body_text text,
  send_at timestamptz NOT NULL,
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'cancelled', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_due ON public.scheduled_messages(send_at) WHERE status = 'queued';

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_all ON public.scheduled_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;
