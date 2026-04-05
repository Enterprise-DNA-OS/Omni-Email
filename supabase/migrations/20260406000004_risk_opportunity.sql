-- Feature 5.4: Risk & Opportunity Detection
-- Adds ai_signals column to threads for storing detected risk/opportunity signals

ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS ai_signals jsonb DEFAULT '[]';

COMMENT ON COLUMN public.threads.ai_signals IS
  'Array of risk/opportunity signals detected by AI classification. '
  'Each element: { type: "risk"|"opportunity", signal: string, severity: "high"|"medium"|"low" }';
