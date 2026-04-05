-- CommsOS: accounts, threads, messages, calendars, events, tags
-- Tokens live in account_credentials (no user RLS — service role only)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE public.provider AS ENUM ('gmail', 'outlook');

-- Accounts (no secrets here)
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider public.provider NOT NULL,
  email_address text NOT NULL,
  token_expires_at timestamptz,
  sync_state jsonb NOT NULL DEFAULT '{}',
  token_invalid_at timestamptz,
  next_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, email_address)
);

CREATE TABLE public.account_credentials (
  account_id uuid PRIMARY KEY REFERENCES public.accounts (id) ON DELETE CASCADE,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_credentials FROM PUBLIC;
GRANT ALL ON public.account_credentials TO service_role;

CREATE TABLE public.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  subject text,
  snippet text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  primary_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.thread_sources (
  thread_id uuid NOT NULL REFERENCES public.threads (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  provider_thread_id text NOT NULL,
  PRIMARY KEY (account_id, provider_thread_id),
  UNIQUE (thread_id, account_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.threads (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  sender text,
  recipients jsonb NOT NULL DEFAULT '[]',
  body_html text,
  body_text text,
  message_at timestamptz NOT NULL,
  in_reply_to text,
  is_read boolean NOT NULL DEFAULT false,
  labels jsonb NOT NULL DEFAULT '[]',
  raw_headers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider_message_id)
);

CREATE TABLE public.calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  provider_calendar_id text NOT NULL,
  name text NOT NULL,
  UNIQUE (account_id, provider_calendar_id)
);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES public.calendars (id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  raw jsonb,
  UNIQUE (calendar_id, provider_event_id)
);

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE public.thread_tags (
  thread_id uuid NOT NULL REFERENCES public.threads (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, tag_id)
);

-- Indexes
CREATE INDEX threads_user_last_msg_idx ON public.threads (user_id, last_message_at DESC);
CREATE INDEX messages_thread_time_idx ON public.messages (thread_id, message_at);
CREATE INDEX events_calendar_range_idx ON public.events (calendar_id, start_time, end_time);
CREATE INDEX thread_tags_tag_idx ON public.thread_tags (tag_id);
CREATE INDEX accounts_user_next_sync_idx ON public.accounts (user_id, next_sync_at);

CREATE INDEX threads_search_gin ON public.threads USING gin (search_vector);

-- Maintain search_vector (subject + snippet + denormalized sender from last message optional — MVP: subject + snippet)
CREATE OR REPLACE FUNCTION public.threads_search_trigger () RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.snippet, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER threads_search_update
  BEFORE INSERT OR UPDATE OF subject, snippet ON public.threads
  FOR EACH ROW
  EXECUTE PROCEDURE public.threads_search_trigger ();

-- Messages: extend thread search on new message
CREATE OR REPLACE FUNCTION public.messages_update_thread_search () RETURNS trigger AS $$
BEGIN
  UPDATE public.threads t
  SET
    snippet = coalesce(NEW.body_text, left(NEW.body_html, 200), t.snippet),
    last_message_at = GREATEST(t.last_message_at, NEW.message_at),
    search_vector =
      setweight(to_tsvector('english', coalesce(t.subject, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(coalesce(NEW.body_text, left(NEW.body_html, 500)), t.snippet, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(NEW.sender, '')), 'B')
  WHERE t.id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_after_insert_search
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.messages_update_thread_search ();

-- RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_tags ENABLE ROW LEVEL SECURITY;

-- accounts: users list + disconnect; OAuth writes use service role
CREATE POLICY accounts_select ON public.accounts FOR SELECT TO authenticated USING (user_id = auth.uid ());
CREATE POLICY accounts_delete ON public.accounts FOR DELETE TO authenticated USING (user_id = auth.uid ());

-- threads / mail / calendar: read-only for JWT; mutations via service role in API/Edge
CREATE POLICY threads_select ON public.threads FOR SELECT TO authenticated USING (user_id = auth.uid ());

CREATE POLICY thread_sources_select ON public.thread_sources FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND t.user_id = auth.uid ())
);

CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND t.user_id = auth.uid ())
);

CREATE POLICY calendars_select ON public.calendars FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid ())
);

CREATE POLICY events_select ON public.events FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendars c
    JOIN public.accounts a ON a.id = c.account_id
    WHERE c.id = calendar_id AND a.user_id = auth.uid ()
  )
);

-- tags
CREATE POLICY tags_all ON public.tags FOR ALL TO authenticated USING (user_id = auth.uid ()) WITH CHECK (user_id = auth.uid ());

-- thread_tags
CREATE POLICY thread_tags_all ON public.thread_tags FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND t.user_id = auth.uid ())
  AND EXISTS (SELECT 1 FROM public.tags g WHERE g.id = tag_id AND g.user_id = auth.uid ())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND t.user_id = auth.uid ())
  AND EXISTS (SELECT 1 FROM public.tags g WHERE g.id = tag_id AND g.user_id = auth.uid ())
);

-- Grant
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, DELETE ON public.accounts TO authenticated;
GRANT SELECT ON public.threads TO authenticated;
GRANT SELECT ON public.thread_sources TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.calendars TO authenticated;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_tags TO authenticated;
