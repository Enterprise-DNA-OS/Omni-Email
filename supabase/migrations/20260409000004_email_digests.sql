CREATE TABLE digest_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','never')),
  schedule_time time DEFAULT '08:00',
  schedule_day_of_week integer, -- 0=Sun..6=Sat, for weekly
  include_categories text[] DEFAULT '{}',
  include_tags text[] DEFAULT '{}',
  include_senders text[] DEFAULT '{}',
  enabled boolean DEFAULT true,
  last_digest_at timestamptz,
  next_digest_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE digest_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own digest config" ON digest_config FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own digest config" ON digest_config FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own digest config" ON digest_config FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own digest config" ON digest_config FOR DELETE USING (user_id = auth.uid());
CREATE INDEX idx_digest_config_user ON digest_config(user_id);

CREATE TABLE digest_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_config_id uuid NOT NULL REFERENCES digest_config(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL,
  thread_count integer NOT NULL DEFAULT 0,
  thread_ids uuid[] DEFAULT '{}',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed')),
  generated_at timestamptz,
  delivered boolean DEFAULT false,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE digest_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own digest entries" ON digest_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own digest entries" ON digest_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own digest entries" ON digest_entries FOR UPDATE USING (user_id = auth.uid());
CREATE INDEX idx_digest_entries_config ON digest_entries(digest_config_id, created_at DESC);
CREATE INDEX idx_digest_entries_user ON digest_entries(user_id, created_at DESC);
