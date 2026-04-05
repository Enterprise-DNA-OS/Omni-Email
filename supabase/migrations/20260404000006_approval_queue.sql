CREATE TABLE public.approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  proposed_action text NOT NULL,
  proposed_details jsonb NOT NULL DEFAULT '{}',
  confidence numeric(3,2) NOT NULL,
  reasoning text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  resolved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_queue_user_pending ON public.approval_queue(user_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_approval_queue_expires ON public.approval_queue(expires_at) WHERE status = 'pending';

ALTER TABLE public.approval_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_queue_select ON public.approval_queue
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.approval_queue TO authenticated;
GRANT ALL ON public.approval_queue TO service_role;
