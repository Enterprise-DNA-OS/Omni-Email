CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  theme text DEFAULT 'system',
  density text DEFAULT 'comfortable',
  reading_pane text DEFAULT 'off',
  font_size text DEFAULT 'medium',
  timezone text DEFAULT 'UTC',
  quiet_hours jsonb DEFAULT '{}',
  action_thresholds jsonb DEFAULT '{"archive": 0.85, "delete": 0.95, "send": 0.95, "label": 0.7}',
  dnd_until timestamptz,
  last_session_at timestamptz,
  operating_mode text,
  mode_config jsonb DEFAULT '{}',
  feature_flags jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_all ON public.user_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
