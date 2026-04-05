-- Personal Operating Modes (Feature 5.x / Tier 5)
-- Adds a CHECK constraint to the existing operating_mode column and ensures
-- mode_config is present. Both columns were introduced in the catch-me-up
-- migration (20260405000007) without a constraint, so we add it here.

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_operating_mode_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_operating_mode_check
    CHECK (
      operating_mode IS NULL OR
      operating_mode IN ('default','ceo','assistant','sales','support','travel','deep_work')
    );

COMMENT ON COLUMN public.user_preferences.operating_mode IS 'Active operating mode: default | ceo | assistant | sales | support | travel | deep_work';
COMMENT ON COLUMN public.user_preferences.mode_config IS 'Per-mode overrides and config, stored as JSONB';
