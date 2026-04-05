-- Document filing: tracks attachment-to-cloud-storage operations
CREATE TABLE document_filing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  filename text NOT NULL,
  mime_type text,
  file_size bigint,
  storage_provider text NOT NULL CHECK (storage_provider IN ('google_drive','onedrive')),
  destination_folder text,
  destination_folder_id text,
  storage_file_id text,
  storage_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filing','filed','rejected','failed')),
  ai_confidence numeric(3,2),
  ai_reasoning text,
  error_message text,
  filed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_filing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own filings" ON document_filing FOR SELECT USING (user_id = auth.uid());
CREATE INDEX idx_document_filing_user_status ON document_filing(user_id, status);
CREATE INDEX idx_document_filing_thread ON document_filing(thread_id);

-- Filing configuration per account
CREATE TABLE filing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  storage_provider text NOT NULL CHECK (storage_provider IN ('google_drive','onedrive')),
  root_folder_id text,
  root_folder_name text,
  auto_file boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

ALTER TABLE filing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own filing config" ON filing_config FOR SELECT USING (user_id = auth.uid());
