-- Feature 4.3: Tone Learning Per Account
-- Stores the AI-analyzed writing style profile for each connected account

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS writing_style_profile text,
  ADD COLUMN IF NOT EXISTS style_analyzed_at timestamptz;

COMMENT ON COLUMN public.accounts.writing_style_profile IS
  'AI-generated prose description of this account owner''s writing style, '
  'derived from their last 50 sent messages. Used to match tone when drafting replies.';

COMMENT ON COLUMN public.accounts.style_analyzed_at IS
  'Timestamp of the last writing style analysis run for this account.';
