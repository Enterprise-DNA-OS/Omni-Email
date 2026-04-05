ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS auto_archive_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_archive_threshold numeric(3,2) DEFAULT 0.85;
