-- Relationship Intelligence: persistent contacts with computed relationship metrics

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text NOT NULL,
  domain text,
  company text,
  relationship_score numeric(5,2) DEFAULT 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  avg_response_time_hours numeric(10,2),
  message_count_in integer DEFAULT 0,
  message_count_out integer DEFAULT 0,
  first_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS public.contact_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  responded_in_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_contacts_user_score
  ON public.contacts(user_id, relationship_score DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_user_domain
  ON public.contacts(user_id, domain);

CREATE INDEX IF NOT EXISTS idx_contacts_user_email
  ON public.contacts(user_id, email);

CREATE INDEX IF NOT EXISTS idx_contacts_neglected
  ON public.contacts(user_id, last_inbound_at DESC, last_outbound_at)
  WHERE message_count_in > 3;

CREATE INDEX IF NOT EXISTS idx_contact_interactions_contact
  ON public.contact_interactions(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_interactions_thread
  ON public.contact_interactions(thread_id);

-- RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_interactions ENABLE ROW LEVEL SECURITY;

-- contacts: users own their own contact records
CREATE POLICY contacts_all ON public.contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- contact_interactions: accessible only if the underlying contact belongs to the user
CREATE POLICY contact_interactions_select ON public.contact_interactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id AND c.user_id = auth.uid()
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

GRANT SELECT ON public.contact_interactions TO authenticated;
GRANT ALL ON public.contact_interactions TO service_role;
