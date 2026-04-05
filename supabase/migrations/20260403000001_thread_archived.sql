ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS threads_user_inbox_idx
  ON public.threads (user_id, last_message_at DESC)
  WHERE archived_at IS NULL;
