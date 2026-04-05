import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { stripHtml } from "@/lib/ai/client";
import { classifyUnprocessedThreads } from "@/lib/ai/classify";

type AccountRow = {
  id: string;
  user_id: string;
  provider: "gmail" | "outlook";
  email_address: string;
  token_expires_at: string | null;
  sync_state: Record<string, unknown>;
};

type CredsRow = {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing ${name}`);
  }
  return v;
}

async function loadTokens(creds: CredsRow): Promise<{ access: string; refresh: string | null }> {
  const key = requireEnv("TOKEN_ENCRYPTION_KEY");
  void key;
  const access = decryptSecret(creds.access_token_ciphertext);
  const refresh = creds.refresh_token_ciphertext
    ? decryptSecret(creds.refresh_token_ciphertext)
    : null;
  return { access, refresh };
}

async function persistTokens(
  accountId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number,
): Promise<void> {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await admin
    .from("accounts")
    .update({ token_expires_at: expiresAt, token_invalid_at: null })
    .eq("id", accountId);
  const accessEnc = encryptSecret(accessToken);
  const refreshEnc = refreshToken ? encryptSecret(refreshToken) : null;
  await admin.from("account_credentials").upsert({
    account_id: accountId,
    access_token_ciphertext: accessEnc,
    refresh_token_ciphertext: refreshEnc,
    updated_at: new Date().toISOString(),
  });
}

async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google refresh failed: ${await res.text()}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  const body = new URLSearchParams({
    client_id: requireEnv("MICROSOFT_CLIENT_ID"),
    client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Microsoft refresh failed: ${await res.text()}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

async function ensureValidAccess(account: AccountRow, creds: CredsRow): Promise<string> {
  const { access, refresh } = await loadTokens(creds);
  const exp = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (exp > Date.now() + 60_000) {
    return access;
  }
  if (!refresh) {
    throw new Error("No refresh token; reconnect account");
  }
  if (account.provider === "gmail") {
    const t = await refreshGoogleToken(refresh);
    await persistTokens(account.id, t.access_token, t.refresh_token ?? refresh, t.expires_in);
    return t.access_token;
  }
  const t = await refreshMicrosoftToken(refresh);
  await persistTokens(account.id, t.access_token, t.refresh_token ?? refresh, t.expires_in);
  return t.access_token;
}

function headerLine(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value;
}

type MimePart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  headers?: { name?: string; value?: string }[];
  parts?: MimePart[];
};

type AttachmentMeta = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
};

type ParsedMessage = {
  providerMessageId: string;
  providerThreadId: string;
  subject: string;
  snippet: string;
  from: string;
  recipients: string[];
  bodyHtml: string | null;
  bodyText: string | null;
  messageAt: string;
  inReplyTo: string | null;
  isRead: boolean;
  labels: string[];
  attachments: AttachmentMeta[];
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
};

function extractGmailBodies(payload: MimePart | undefined): { html: string | null; text: string | null } {
  let html: string | null = null;
  let text: string | null = null;
  const decode = (data?: string) =>
    data
      ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
      : "";

  const walk = (p: MimePart) => {
    if (p.mimeType === "text/html" && p.body?.data && !html) {
      html = decode(p.body.data);
    }
    if (p.mimeType === "text/plain" && p.body?.data && !text) {
      text = decode(p.body.data);
    }
    p.parts?.forEach(walk);
  };

  if (!payload) {
    return { html, text };
  }
  if (payload.body?.data) {
    if (payload.mimeType === "text/html") {
      html = decode(payload.body.data);
    }
    if (payload.mimeType === "text/plain") {
      text = decode(payload.body.data);
    }
  }
  if (payload.parts) {
    walk(payload);
  }
  return { html, text };
}

function extractGmailAttachments(payload: MimePart | undefined): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = [];
  const walk = (p: MimePart) => {
    if (p.filename && p.body?.attachmentId) {
      attachments.push({
        filename: p.filename,
        mimeType: p.mimeType ?? "application/octet-stream",
        size: p.body.size ?? 0,
        attachmentId: p.body.attachmentId,
      });
    }
    p.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  return attachments;
}

function parseGmailMessage(raw: {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: MimePart & { headers?: { name?: string; value?: string }[] };
}): ParsedMessage {
  const hdrs = raw.payload?.headers;
  const subject = headerLine(hdrs, "Subject") ?? "(no subject)";
  const from = headerLine(hdrs, "From") ?? "";
  const toRaw = headerLine(hdrs, "To") ?? "";
  const recipients = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const inReplyTo = headerLine(hdrs, "In-Reply-To") ?? null;
  const listUnsubscribe = headerLine(hdrs, "List-Unsubscribe") ?? null;
  const listUnsubscribePost = headerLine(hdrs, "List-Unsubscribe-Post") ?? null;
  const { html, text } = extractGmailBodies(raw.payload);
  const attachments = extractGmailAttachments(raw.payload);
  const ms = raw.internalDate ? Number(raw.internalDate) : Date.now();
  const messageAt = new Date(ms).toISOString();
  const isRead = !(raw.labelIds ?? []).includes("UNREAD");
  return {
    providerMessageId: raw.id,
    providerThreadId: raw.threadId,
    subject,
    snippet: stripHtml(raw.snippet ?? text?.slice(0, 200) ?? "").slice(0, 200),
    from,
    recipients,
    bodyHtml: html,
    bodyText: text ?? raw.snippet ?? null,
    messageAt,
    inReplyTo,
    isRead,
    labels: raw.labelIds ?? [],
    attachments,
    listUnsubscribe,
    listUnsubscribePost,
  };
}

async function syncGmailAccount(account: AccountRow, creds: CredsRow): Promise<void> {
  const admin = createAdminClient();
  const token = await ensureValidAccess(account, creds);

  // Incremental: use last sync timestamp, fallback to 7 days for first sync
  const lastSyncedAt = account.sync_state?.lastSyncedAt as string | undefined;
  let query: string;
  if (lastSyncedAt) {
    // Gmail after: uses YYYY/MM/DD format
    const d = new Date(lastSyncedAt);
    const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    query = `after:${dateStr}`;
  } else {
    query = "newer_than:7d";
  }

  // Paginate through Gmail results — cap at 200 messages per sync to avoid timeouts
  const MAX_MESSAGES = 200;
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const pageUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    pageUrl.searchParams.set("q", query);
    pageUrl.searchParams.set("maxResults", "50");
    if (pageToken) {
      pageUrl.searchParams.set("pageToken", pageToken);
    }
    const listRes = await fetch(pageUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) {
      throw new Error(`Gmail list failed: ${await listRes.text()}`);
    }
    const listJson = (await listRes.json()) as {
      messages?: { id: string }[];
      nextPageToken?: string;
    };
    for (const m of listJson.messages ?? []) {
      ids.push(m.id);
    }
    pageToken = ids.length < MAX_MESSAGES ? listJson.nextPageToken : undefined;
  } while (pageToken);

  // Fetch messages in parallel (batches of 5 to avoid rate limits)
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (mid) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) {
          console.error(`Gmail message fetch failed for ${mid}: ${r.status} ${r.statusText}`);
          return null;
        }
        return r.json() as Promise<{
          id: string;
          threadId: string;
          snippet?: string;
          internalDate?: string;
          labelIds?: string[];
          payload?: MimePart & { headers?: { name?: string; value?: string }[] };
        }>;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        try {
          const parsed = parseGmailMessage(result.value);
          await upsertMailMessage(admin, account, parsed);
        } catch (e) {
          console.error(`Failed to upsert Gmail message ${result.value.id}:`, e);
        }
      }
    }
  }

  // Update sync_state with current timestamp
  await admin
    .from("accounts")
    .update({ sync_state: { ...account.sync_state, lastSyncedAt: new Date().toISOString() } })
    .eq("id", account.id);
}

function parseOutlookMessage(m: {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime?: string;
  internetMessageHeaders?: { name?: string; value?: string }[];
  isRead?: boolean;
  hasAttachments?: boolean;
}, outlookAttachments?: AttachmentMeta[]): ParsedMessage {
  const threadId = m.conversationId ?? m.id;
  const fromName = m.from?.emailAddress?.name?.trim();
  const fromAddr = m.from?.emailAddress?.address?.trim();
  const from = fromName && fromAddr
    ? `${fromName} <${fromAddr}>`
    : fromName ?? fromAddr ?? "";
  const rec =
    m.toRecipients?.map((t) => t.emailAddress?.address).filter((x): x is string => Boolean(x)) ?? [];
  const ct = m.body?.contentType?.toLowerCase() ?? "";
  const html = ct === "html" ? (m.body?.content ?? null) : null;
  const text =
    ct === "text" ? (m.body?.content ?? null) : html ? null : (m.body?.content ?? m.bodyPreview ?? null);
  const inReply =
    m.internetMessageHeaders?.find((h) => h.name?.toLowerCase() === "in-reply-to")?.value ?? null;
  const listUnsubscribe =
    m.internetMessageHeaders?.find((h) => h.name?.toLowerCase() === "list-unsubscribe")?.value ?? null;
  const listUnsubscribePost =
    m.internetMessageHeaders?.find((h) => h.name?.toLowerCase() === "list-unsubscribe-post")?.value ?? null;
  const messageAt = m.receivedDateTime
    ? new Date(m.receivedDateTime).toISOString()
    : new Date().toISOString();
  return {
    providerMessageId: m.id,
    providerThreadId: threadId,
    subject: m.subject ?? "(no subject)",
    snippet: stripHtml(m.bodyPreview ?? (typeof text === "string" ? text.slice(0, 200) : "")).slice(0, 200),
    from,
    recipients: rec,
    bodyHtml: html,
    bodyText: text,
    messageAt,
    inReplyTo: inReply,
    isRead: Boolean(m.isRead),
    labels: [],
    attachments: outlookAttachments ?? [],
    listUnsubscribe,
    listUnsubscribePost,
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

function parseSenderParts(from: string): { name: string | null; email: string | null } {
  if (!from) return { name: null, email: null };
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, "") || null, email: match[2].trim() };
  }
  if (from.includes("@")) {
    return { name: null, email: from.trim() };
  }
  return { name: from.trim(), email: null };
}

async function upsertMailMessage(
  admin: AdminClient,
  account: AccountRow,
  parsed: ParsedMessage,
): Promise<void> {
  const isRead = parsed.isRead;
  const { name: senderName, email: senderEmail } = parseSenderParts(parsed.from);
  const { data: existingSource } = await admin
    .from("thread_sources")
    .select("thread_id")
    .eq("account_id", account.id)
    .eq("provider_thread_id", parsed.providerThreadId)
    .maybeSingle();

  const isNewsletter = Boolean(parsed.listUnsubscribe);

  let threadId: string;
  if (existingSource?.thread_id) {
    threadId = existingSource.thread_id as string;

    // Skip threads that were soft-deleted by the user — don't resurrect them
    const { data: existingThread } = await admin
      .from("threads")
      .select("deleted_at")
      .eq("id", threadId)
      .maybeSingle();
    if (existingThread?.deleted_at) {
      return;
    }

    // Only update snippet/timestamp — don't overwrite sender fields,
    // because later messages (e.g. user's own replies) would replace the
    // original sender with the user's own email address.
    const threadUpdate: Record<string, unknown> = {
      subject: parsed.subject,
      snippet: parsed.snippet,
      last_message_at: parsed.messageAt,
      primary_account_id: account.id,
    };
    // Preserve newsletter signals — once a newsletter, always track unsubscribe link
    if (parsed.listUnsubscribe) {
      // Encode both List-Unsubscribe and List-Unsubscribe-Post into the single column.
      // Format: "<original header value>\nList-Unsubscribe-Post: <post value>"
      // unsubscribe.ts parses for the "List-Unsubscribe-Post:" line to detect one-click support.
      const unsubValue = parsed.listUnsubscribePost
        ? `${parsed.listUnsubscribe}\nList-Unsubscribe-Post: ${parsed.listUnsubscribePost}`
        : parsed.listUnsubscribe;
      threadUpdate.list_unsubscribe = unsubValue;
      threadUpdate.is_newsletter = true;
    }
    await admin.from("threads").update(threadUpdate).eq("id", threadId);
  } else {
    // Encode both List-Unsubscribe headers into the single column on first insert
    const listUnsubscribeValue = parsed.listUnsubscribe
      ? parsed.listUnsubscribePost
        ? `${parsed.listUnsubscribe}\nList-Unsubscribe-Post: ${parsed.listUnsubscribePost}`
        : parsed.listUnsubscribe
      : null;
    const { data: insThread, error: te } = await admin
      .from("threads")
      .insert({
        user_id: account.user_id,
        subject: parsed.subject,
        snippet: parsed.snippet,
        last_message_at: parsed.messageAt,
        primary_account_id: account.id,
        sender_name: senderName,
        sender_email: senderEmail,
        list_unsubscribe: listUnsubscribeValue,
        is_newsletter: isNewsletter,
      })
      .select("id")
      .single();
    if (te || !insThread) {
      throw te ?? new Error("thread insert");
    }
    threadId = insThread.id as string;
    const { error: se } = await admin.from("thread_sources").insert({
      thread_id: threadId,
      account_id: account.id,
      provider_thread_id: parsed.providerThreadId,
    });
    if (se) {
      throw se;
    }
  }

  const { error: me } = await admin.from("messages").upsert(
    {
      thread_id: threadId,
      account_id: account.id,
      provider_message_id: parsed.providerMessageId,
      sender: parsed.from,
      recipients: parsed.recipients,
      body_html: parsed.bodyHtml,
      body_text: parsed.bodyText,
      message_at: parsed.messageAt,
      in_reply_to: parsed.inReplyTo,
      is_read: isRead,
      labels: parsed.labels,
      attachments: parsed.attachments,
      raw_headers: {},
    },
    { onConflict: "account_id,provider_message_id" },
  );
  if (me) {
    throw me;
  }
}

async function syncOutlookAccount(account: AccountRow, creds: CredsRow): Promise<void> {
  const admin = createAdminClient();
  const token = await ensureValidAccess(account, creds);

  // Sync from Inbox folder only — excludes Deleted Items, Junk, Drafts, etc.
  // Previously used /me/messages which returns ALL folders, causing deleted
  // emails to re-appear after being trashed.
  const u = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  u.searchParams.set("$top", "50");
  u.searchParams.set("$orderby", "receivedDateTime desc");
  u.searchParams.set(
    "$select",
    "id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,internetMessageHeaders,hasAttachments",
  );

  // Incremental: filter by last sync timestamp
  const lastSyncedAt = account.sync_state?.lastSyncedAt as string | undefined;
  if (lastSyncedAt) {
    u.searchParams.set("$filter", `receivedDateTime ge ${lastSyncedAt}`);
  } else {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    u.searchParams.set("$filter", `receivedDateTime ge ${sevenDaysAgo}`);
  }

  // Paginate through Graph results — cap at 200 messages per sync to avoid timeouts
  const MAX_OUTLOOK_MESSAGES = 200;
  let nextUrl: string | undefined = u.toString();
  let outlookMessageCount = 0;

  while (nextUrl && outlookMessageCount < MAX_OUTLOOK_MESSAGES) {
  const listRes = await fetch(nextUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    throw new Error(`Graph messages failed: ${await listRes.text()}`);
  }
  const listJson = (await listRes.json()) as { value?: unknown[]; "@odata.nextLink"?: string };
  nextUrl = outlookMessageCount + (listJson.value?.length ?? 0) < MAX_OUTLOOK_MESSAGES
    ? listJson["@odata.nextLink"]
    : undefined;
  for (const item of listJson.value ?? []) {
    if (outlookMessageCount >= MAX_OUTLOOK_MESSAGES) break;
    outlookMessageCount++;
    try {
      const msg = item as Parameters<typeof parseOutlookMessage>[0];
      let outlookAttachments: AttachmentMeta[] = [];
      if (msg.hasAttachments) {
        try {
          const attRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (attRes.ok) {
            const attJson = (await attRes.json()) as {
              value?: { id?: string; name?: string; contentType?: string; size?: number }[];
            };
            outlookAttachments = (attJson.value ?? [])
              .filter((a) => a.id && a.name)
              .map((a) => ({
                filename: a.name!,
                mimeType: a.contentType ?? "application/octet-stream",
                size: a.size ?? 0,
                attachmentId: a.id!,
              }));
          }
        } catch {
          /* non-fatal */
        }
      }
      const parsed = parseOutlookMessage(msg, outlookAttachments);
      await upsertMailMessage(admin, account, parsed);
    } catch (e) {
      console.error("Failed to upsert Outlook message:", e);
    }
  } // end for
  } // end while

  // Update sync_state with current timestamp
  await admin
    .from("accounts")
    .update({ sync_state: { ...account.sync_state, lastSyncedAt: new Date().toISOString() } })
    .eq("id", account.id);
}

export async function getValidAccessToken(accountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: account, error: aErr } = await admin
    .from("accounts")
    .select("id, user_id, provider, email_address, token_expires_at")
    .eq("id", accountId)
    .maybeSingle();
  if (aErr || !account) {
    throw aErr ?? new Error("account not found");
  }
  const { data: creds, error: cErr } = await admin
    .from("account_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext")
    .eq("account_id", accountId)
    .maybeSingle();
  if (cErr || !creds) {
    throw cErr ?? new Error("missing credentials");
  }
  return ensureValidAccess(account as AccountRow, creds as CredsRow);
}

export async function syncEmailAccount(accountId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: account, error: aErr } = await admin
    .from("accounts")
    .select("id, user_id, provider, email_address, token_expires_at, sync_state")
    .eq("id", accountId)
    .maybeSingle();
  if (aErr || !account) {
    throw aErr ?? new Error("account not found");
  }
  const acc = account as AccountRow;
  const { data: creds, error: cErr } = await admin
    .from("account_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext")
    .eq("account_id", accountId)
    .maybeSingle();
  if (cErr || !creds) {
    throw cErr ?? new Error("missing credentials");
  }
  const c = creds as CredsRow;
  try {
    if (acc.provider === "gmail") {
      await syncGmailAccount(acc, c);
    } else {
      await syncOutlookAccount(acc, c);
    }
  } catch (e) {
    // Only mark token as invalid for auth-related errors (401/403 from provider APIs).
    // Transient errors (network failures, rate limits, etc.) should just retry later.
    const msg = e instanceof Error ? e.message : String(e);
    const isAuthError =
      /401|403|unauthorized|forbidden|invalid.*(token|credential|auth)/i.test(msg);

    if (isAuthError) {
      await admin
        .from("accounts")
        .update({ token_invalid_at: new Date().toISOString() })
        .eq("id", accountId);
    } else {
      // Retry after 15 minutes for transient errors
      await admin
        .from("accounts")
        .update({ next_sync_at: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq("id", accountId);
    }
    throw e;
  }
  await admin
    .from("accounts")
    .update({
      next_sync_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      token_invalid_at: null,
    })
    .eq("id", accountId);

  // AI classification: process new threads in background (non-blocking)
  try {
    await classifyUnprocessedThreads(acc.user_id, 25);
  } catch (e) {
    console.error("AI classification after sync failed (non-fatal):", e);
  }

  // Semantic search embeddings: index new messages so they appear in chat search
  try {
    const { embedUnprocessedMessages } = await import("@/lib/ai/embeddings");
    await embedUnprocessedMessages(acc.user_id, 10);
  } catch (e) {
    console.error("Embedding after sync failed (non-fatal):", e);
  }

  // Auto-archive: run after classification so newly classified threads are included
  try {
    const { processAutoArchive } = await import("@/lib/automation/auto-archive");
    await processAutoArchive(acc.user_id);
  } catch (e) {
    console.error("Auto-archive failed (non-fatal):", e);
  }

  // Rules evaluation: run user-defined automation rules on newly classified threads
  try {
    const { evaluateRulesForNewThreads } = await import("@/lib/rules/engine");
    await evaluateRulesForNewThreads(acc.user_id);
  } catch (e) {
    console.error("Rules evaluation failed (non-fatal):", e);
  }

  // Auto-draft: generate AI reply drafts for reply-intent threads
  try {
    const { processAutoDrafts } = await import("@/lib/automation/auto-draft");
    await processAutoDrafts(acc.user_id, 3);
  } catch (e) {
    console.error("Auto-draft generation failed (non-fatal):", e);
  }

  // Auto-delete: soft-delete junk/spam threads the AI is highly confident should go
  try {
    const { processAutoDelete } = await import("@/lib/automation/auto-delete");
    await processAutoDelete(acc.user_id);
  } catch (e) {
    console.error("Auto-delete failed (non-fatal):", e);
  }

  // Hard-delete purge: permanently erase threads past their 30-day grace period
  try {
    const { purgeHardDeleteDue } = await import("@/lib/automation/auto-delete");
    await purgeHardDeleteDue();
  } catch (e) {
    console.error("Hard-delete purge failed (non-fatal):", e);
  }

  // Auto-send: send AI-drafted replies where the user has enabled auto-send
  try {
    const { processAutoSend } = await import("@/lib/automation/auto-send");
    await processAutoSend(acc.user_id);
  } catch (e) {
    console.error("Auto-send failed (non-fatal):", e);
  }

  // Task extraction: pull action items from newly classified threads
  try {
    const { extractTasksForUser } = await import("@/lib/ai/extract-tasks");
    await extractTasksForUser(acc.user_id, 3);
  } catch (e) {
    console.error("Task extraction failed (non-fatal):", e);
  }

  // Follow-up detection: find sent messages awaiting reply and generate drafts for due ones
  try {
    const { detectAwaitingReply, processFollowUpsDue } = await import("@/lib/ai/follow-up");
    await detectAwaitingReply(acc.user_id);
    await processFollowUpsDue(acc.user_id);
  } catch (e) {
    console.error("Follow-up processing failed (non-fatal):", e);
  }
}

export async function syncDueAccounts(opts?: {
  userId?: string;
  limit?: number;
}): Promise<{ synced: string[]; errors: { id: string; message: string }[] }> {
  const admin = createAdminClient();
  const limit = opts?.limit ?? 8;
  const now = new Date().toISOString();
  let q = admin
    .from("accounts")
    .select("id")
    .is("token_invalid_at", null)
    .lte("next_sync_at", now)
    .order("next_sync_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (opts?.userId) {
    q = q.eq("user_id", opts.userId);
  }
  const { data: rows, error } = await q;
  if (error) {
    throw error;
  }
  const synced: string[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const r of rows ?? []) {
    const id = r.id as string;
    try {
      await syncEmailAccount(id);
      synced.push(id);
    } catch (e) {
      errors.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { synced, errors };
}
