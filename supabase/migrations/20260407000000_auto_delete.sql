ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS hard_delete_after timestamptz;

CREATE INDEX idx_threads_soft_deleted
  ON public.threads(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_threads_hard_delete_due
  ON public.threads(hard_delete_after)
  WHERE hard_delete_after IS NOT NULL AND deleted_at IS NOT NULL;
