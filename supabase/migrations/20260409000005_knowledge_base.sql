-- Knowledge Base & Snippets (Feature: KB)
-- Stores user-defined facts, preferences, procedures, and reply snippets
-- that are injected into AI draft generation prompts.

CREATE TABLE knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('fact','preference','procedure','snippet')),
  title text NOT NULL,
  content text NOT NULL,
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','sender','domain','topic')),
  scope_value text, -- email address, domain, or topic name (null for global)
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own knowledge" ON knowledge_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users insert own knowledge" ON knowledge_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own knowledge" ON knowledge_entries
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users delete own knowledge" ON knowledge_entries
  FOR DELETE USING (user_id = auth.uid());

-- Indexes for common query patterns
CREATE INDEX idx_knowledge_user_type ON knowledge_entries(user_id, type);
CREATE INDEX idx_knowledge_scope ON knowledge_entries(user_id, scope, scope_value);
CREATE INDEX idx_knowledge_active ON knowledge_entries(user_id, is_active);

-- Full-text search on title + content
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;

CREATE INDEX idx_knowledge_search ON knowledge_entries USING gin(search_vector);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_knowledge_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_knowledge_updated_at
  BEFORE UPDATE ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_updated_at();
