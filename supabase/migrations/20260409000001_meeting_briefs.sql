-- Meeting Briefs: auto-generated AI briefing documents before calendar meetings

CREATE TABLE public.meeting_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  event_title text NOT NULL,
  event_start timestamptz NOT NULL,
  attendees jsonb NOT NULL DEFAULT '[]',
  brief_content text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed','expired')),
  generated_at timestamptz,
  delivered_at timestamptz,
  delivery_method text DEFAULT 'in_app' CHECK (delivery_method IN ('in_app','email')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own briefs" ON public.meeting_briefs
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX idx_meeting_briefs_user_status ON public.meeting_briefs(user_id, status);
CREATE INDEX idx_meeting_briefs_event_start ON public.meeting_briefs(event_start);

GRANT SELECT ON public.meeting_briefs TO authenticated;
GRANT ALL ON public.meeting_briefs TO service_role;

-- Add meeting brief preferences to user_preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS meeting_briefs_enabled boolean DEFAULT false;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS meeting_briefs_lead_minutes integer DEFAULT 30;
