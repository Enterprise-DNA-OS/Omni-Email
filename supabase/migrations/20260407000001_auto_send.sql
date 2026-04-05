CREATE TABLE public.auto_send_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('sender', 'domain', 'category')),
  scope_value text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope_type, scope_value)
);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS auto_sends_this_hour integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_send_hour_reset_at timestamptz;

ALTER TABLE public.auto_send_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_send_config_all ON public.auto_send_config
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_send_config TO authenticated;
GRANT ALL ON public.auto_send_config TO service_role;
