ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
CREATE INDEX idx_threads_snoozed ON public.threads(snoozed_until) WHERE snoozed_until IS NOT NULL;
