/**
 * Filing Engine — orchestrates the full pipeline:
 *  1. Fetch attachment bytes from Gmail or Outlook
 *  2. Call AI classifier edge function for folder suggestion
 *  3. Ensure destination folder exists in Google Drive / OneDrive
 *  4. Upload file
 *  5. Update document_filing row in Supabase
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/email/sync";
import {
  listDriveFolders,
  ensureDriveFolder,
  uploadToDrive,
} from "@/lib/storage/google-drive";
import {
  listOneDriveFolders,
  ensureOneDriveFolder,
  uploadToOneDrive,
} from "@/lib/storage/onedrive";

interface FilingRow {
  id: string;
  user_id: string;
  account_id: string;
  thread_id: string | null;
  message_id: string | null;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  storage_provider: "google_drive" | "onedrive";
  destination_folder: string | null;
  destination_folder_id: string | null;
  status: string;
}

interface MessageRow {
  provider_message_id: string;
  account_id: string;
  attachments: AttachmentMeta[] | null;
}

interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

interface AccountRow {
  provider: "gmail" | "outlook";
}

interface FolderOption {
  id: string;
  name: string;
  path?: string;
}

interface ClassifierResult {
  folder: string;
  folder_id: string | null;
  confidence: number;
  reasoning: string;
}

async function callAiClassifier(
  filename: string,
  mimeType: string | null,
  subject: string | null,
  sender: string | null,
  folders: FolderOption[],
): Promise<ClassifierResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase URL or anon key");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-file-classifier`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename, mime_type: mimeType, subject, sender, folders }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI classifier failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<ClassifierResult>;
}

async function fetchAttachmentBytes(
  provider: "gmail" | "outlook",
  accessToken: string,
  providerMessageId: string,
  attachmentId: string,
): Promise<Buffer> {
  if (provider === "gmail") {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Gmail attachment fetch failed: ${res.status}`);
    }
    const json = (await res.json()) as { data?: string };
    if (!json.data) throw new Error("No attachment data from Gmail");
    return Buffer.from(json.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } else {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${providerMessageId}/attachments/${attachmentId}/$value`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Outlook attachment fetch failed: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

/**
 * Execute the filing pipeline for a document_filing row.
 * Handles status transitions: pending → filing → filed | failed
 */
export async function executeFilingJob(filingId: string): Promise<void> {
  const admin = createAdminClient();

  // Load filing row
  const { data: filing, error: filingErr } = await admin
    .from("document_filing")
    .select("*")
    .eq("id", filingId)
    .single();

  if (filingErr || !filing) {
    throw new Error(`Filing row not found: ${filingId}`);
  }

  const row = filing as FilingRow;

  if (row.status !== "pending") {
    throw new Error(`Filing ${filingId} is not in pending state (current: ${row.status})`);
  }

  // Mark as filing
  await admin
    .from("document_filing")
    .update({ status: "filing" })
    .eq("id", filingId);

  try {
    // Load message
    if (!row.message_id) throw new Error("No message_id on filing row");

    const { data: message } = await admin
      .from("messages")
      .select("provider_message_id, account_id, attachments")
      .eq("id", row.message_id)
      .single();

    if (!message) throw new Error("Message not found");
    const msg = message as MessageRow;

    // Find the attachment metadata
    const attachments: AttachmentMeta[] = Array.isArray(msg.attachments) ? msg.attachments : [];
    const attMeta = attachments.find(
      (a) => a.filename === row.filename,
    );
    if (!attMeta) {
      throw new Error(`Attachment ${row.filename} not found in message metadata`);
    }

    // Load account provider
    const { data: account } = await admin
      .from("accounts")
      .select("provider")
      .eq("id", row.account_id)
      .single();

    if (!account) throw new Error("Account not found");
    const acc = account as AccountRow;

    // Get valid access token for the email account (to fetch attachment bytes)
    const emailToken = await getValidAccessToken(row.account_id);

    // Fetch attachment bytes
    const bytes = await fetchAttachmentBytes(
      acc.provider,
      emailToken,
      msg.provider_message_id,
      attMeta.attachmentId,
    );

    // Load filing config to get cloud storage token source (same account for Gmail→Drive, Outlook→OneDrive)
    const { data: config } = await admin
      .from("filing_config")
      .select("root_folder_id, storage_provider, account_id")
      .eq("account_id", row.account_id)
      .single();

    if (!config) throw new Error("No filing config for account");

    // The cloud storage token uses the same account credentials
    // (Google Drive uses the same OAuth token as Gmail; OneDrive uses the same as Outlook)
    const storageToken = emailToken;
    const storageProvider = row.storage_provider;
    const rootFolderId = (config as { root_folder_id: string | null }).root_folder_id ?? undefined;

    // Load available folders for AI context
    let folders: FolderOption[] = [];
    try {
      if (storageProvider === "google_drive") {
        folders = await listDriveFolders(storageToken, rootFolderId);
      } else {
        folders = await listOneDriveFolders(storageToken, rootFolderId);
      }
    } catch {
      // Non-fatal — AI will suggest a new folder name
      folders = [];
    }

    // Load thread subject + sender for AI context
    let subject: string | null = null;
    let sender: string | null = null;
    if (row.thread_id) {
      const { data: thread } = await admin
        .from("threads")
        .select("subject, sender")
        .eq("id", row.thread_id)
        .single();
      if (thread) {
        const t = thread as { subject?: string | null; sender?: string | null };
        subject = t.subject ?? null;
        sender = t.sender ?? null;
      }
    }

    // Call AI classifier
    const aiResult = await callAiClassifier(
      row.filename,
      row.mime_type,
      subject,
      sender,
      folders,
    );

    // Resolve destination folder — use AI suggested folder_id or ensure by name
    let destinationFolderId: string | undefined;
    let destinationFolderName: string = aiResult.folder;

    if (aiResult.folder_id) {
      destinationFolderId = aiResult.folder_id;
    } else {
      // Create or find the folder
      if (storageProvider === "google_drive") {
        const folder = await ensureDriveFolder(storageToken, aiResult.folder, rootFolderId);
        destinationFolderId = folder.id;
        destinationFolderName = folder.name;
      } else {
        const folder = await ensureOneDriveFolder(storageToken, aiResult.folder, rootFolderId);
        destinationFolderId = folder.id;
        destinationFolderName = folder.name;
      }
    }

    // Upload file
    let storageFileId: string;
    let storageUrl: string;

    if (storageProvider === "google_drive") {
      const uploaded = await uploadToDrive(
        storageToken,
        row.filename,
        row.mime_type ?? "application/octet-stream",
        bytes,
        destinationFolderId,
      );
      storageFileId = uploaded.id;
      storageUrl = uploaded.webViewLink;
    } else {
      const uploaded = await uploadToOneDrive(
        storageToken,
        row.filename,
        row.mime_type ?? "application/octet-stream",
        bytes,
        destinationFolderId,
      );
      storageFileId = uploaded.id;
      storageUrl = uploaded.webUrl;
    }

    // Mark as filed
    await admin
      .from("document_filing")
      .update({
        status: "filed",
        destination_folder: destinationFolderName,
        destination_folder_id: destinationFolderId ?? null,
        storage_file_id: storageFileId,
        storage_url: storageUrl,
        ai_confidence: aiResult.confidence,
        ai_reasoning: aiResult.reasoning,
        filed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", filingId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await admin
      .from("document_filing")
      .update({ status: "failed", error_message: msg })
      .eq("id", filingId);
    throw err;
  }
}

/**
 * Create a pending filing record for a specific attachment on a message,
 * then optionally kick off the filing job immediately.
 */
export async function createFilingRecord(params: {
  userId: string;
  accountId: string;
  threadId: string | null;
  messageId: string;
  filename: string;
  mimeType: string | null;
  fileSize: number | null;
  storageProvider: "google_drive" | "onedrive";
  autoFile?: boolean;
}): Promise<string> {
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("document_filing")
    .insert({
      user_id: params.userId,
      account_id: params.accountId,
      thread_id: params.threadId,
      message_id: params.messageId,
      filename: params.filename,
      mime_type: params.mimeType,
      file_size: params.fileSize,
      storage_provider: params.storageProvider,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(`Failed to create filing record: ${error?.message}`);
  }

  const filingId = (row as { id: string }).id;

  if (params.autoFile) {
    // Fire-and-forget; caller can check status via polling
    void executeFilingJob(filingId).catch(() => undefined);
  }

  return filingId;
}
