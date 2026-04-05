-- Cold email detection log
CREATE TABLE cold_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  sender_domain text,
  confidence numeric(3,2) NOT NULL,
  reasoning text,
  action_taken text CHECK (action_taken IN ('none','labeled','archived','reported')),
  is_false_positive boolean DEFAULT false,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id)
);

ALTER TABLE cold_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own cold email log" ON cold_email_log FOR SELECT USING (user_id = auth.uid());
CREATE INDEX idx_cold_email_user ON cold_email_log(user_id, detected_at DESC);

-- Cold email settings in user_preferences
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cold_email_enabled boolean DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cold_email_mode text DEFAULT 'list' CHECK (cold_email_mode IS NULL OR cold_email_mode IN ('list','label','archive'));
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cold_email_custom_criteria text;
