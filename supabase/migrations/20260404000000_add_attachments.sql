-- Add attachments metadata column to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';
COMMENT ON COLUMN public.messages.attachments IS 'Array of {filename, mimeType, size, attachmentId}';
