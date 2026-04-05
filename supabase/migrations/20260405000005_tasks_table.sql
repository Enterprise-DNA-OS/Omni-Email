CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  description text NOT NULL,
  deadline timestamptz,
  assignee text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dismissed')),
  source text NOT NULL DEFAULT 'ai_extracted' CHECK (source IN ('ai_extracted', 'user_created')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_tasks_user_status ON public.tasks(user_id, status, created_at DESC);
CREATE INDEX idx_tasks_user_deadline ON public.tasks(user_id, deadline)
  WHERE deadline IS NOT NULL AND status = 'pending';

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_all ON public.tasks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS tasks_extracted_at timestamptz;
