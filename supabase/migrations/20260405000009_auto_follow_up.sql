-- Auto-Follow-Up (Feature 2.9)
-- Tracks outbound messages awaiting a reply, with AI-generated follow-up drafts

CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  original_message_id uuid REFERENCES public.messages(id),
  follow_up_count integer DEFAULT 0,
  next_follow_up_at timestamptz,
  max_follow_ups integer DEFAULT 3,
  status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'followed_up', 'replied', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_follow_ups_user_status ON public.follow_ups(user_id, status);
CREATE INDEX idx_follow_ups_due ON public.follow_ups(next_follow_up_at) WHERE status = 'waiting';

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY follow_ups_all ON public.follow_ups
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
