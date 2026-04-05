-- Run My Inbox Mode (Feature 7.5)
-- Adds columns to user_preferences for inbox delegation mode.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS run_inbox_mode_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS run_inbox_mode_until timestamptz,
  ADD COLUMN IF NOT EXISTS run_inbox_emergency_senders jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS run_inbox_summary jsonb;

COMMENT ON COLUMN public.user_preferences.run_inbox_mode_active IS 'Whether Run My Inbox mode is currently active';
COMMENT ON COLUMN public.user_preferences.run_inbox_mode_until IS 'Timestamp when Run My Inbox mode auto-expires (null = indefinite)';
COMMENT ON COLUMN public.user_preferences.run_inbox_emergency_senders IS 'Array of email addresses that bypass Run My Inbox and always surface to the user';
COMMENT ON COLUMN public.user_preferences.run_inbox_summary IS 'Cached summary report generated when mode deactivates';
