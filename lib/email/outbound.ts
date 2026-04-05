import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/email/sync";
import { buildMultipartMime, type AttachmentInput } from "@/lib/email/mime";

type Provider = "gmail" | "outlook";

async function assertThreadOwner(threadId: string, userId: string) {
  const admin = createAdminClient();
  const { data: th, error } = await admin
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !th) {
    throw new Error("Thread not found");
  }
}

async function pickSendAccount(
  threadId: string,
): Promise<{ accountId: string; provider: Provider }> {
  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("messages")
    .select("account_id")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!msg?.account_id) {
    throw new Error("No messages in thread");
  }
  const accountId = msg.account_id as string;
  const { data: acc } = await admin.from("accounts").select("provider").eq("id", accountId).single();
  if (!acc?.provider) {
    throw new Error("Account not found");
  }
  return { accountId, provider: acc.provider as Provider };
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build an Outlook attachment item for the Graph API */
function buildOutlookAttachment(att: AttachmentInput): Record<string, unknown> {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: att.filename,
    contentType: att.mimeType,
    contentBytes: att.content.toString("base64"),
  };
}

export async function sendReply(params: {
  threadId: string;
  userId: string;
  bodyText: string;
  bodyHtml?: string | null;
  accountId?: string;
  attachments?: AttachmentInput[];
}): Promise<void> {
  await assertThreadOwner(params.threadId, params.userId);

  let accountId: string;
  let provider: Provider;

  if (params.accountId) {
    // Verify the caller owns this account
    const admin = createAdminClient();
    const { data: acc, error } = await admin
      .from("accounts")
      .select("id, provider")
      .eq("id", params.accountId)
      .eq("user_id", params.userId)
      .maybeSingle();
    if (error || !acc) {
      throw new Error("Account not found or not owned by user");
    }
    accountId = acc.id as string;
    provider = acc.provider as Provider;
  } else {
    const picked = await pickSendAccount(params.threadId);
    accountId = picked.accountId;
    provider = picked.provider;
  }
  const token = await getValidAccessToken(accountId);
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("messages")
    .select("provider_message_id, sender, in_reply_to, thread_id")
    .eq("thread_id", params.threadId)
    .order("message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last?.provider_message_id) {
    throw new Error("Missing provider message");
  }
  const { data: th } = await admin
    .from("threads")
    .select("subject")
    .eq("id", params.threadId)
    .single();
  const subj = (th?.subject as string | undefined) ?? "";
  const replySubj = subj.toLowerCase().startsWith("re:") ? subj : `Re: ${subj}`;

  const attachments = params.attachments ?? [];

  if (provider === "gmail") {
    const { data: acc } = await admin.from("accounts").select("email_address").eq("id", accountId).single();
    const fromLine = acc?.email_address as string | undefined;
    const toLine = (last.sender as string) ?? "";
    const inReplyTo = (last.in_reply_to as string | null) || `<${last.provider_message_id as string}>`;

    const raw = buildMultipartMime({
      from: fromLine ?? "",
      to: [toLine],
      subject: replySubj,
      bodyHtml: params.bodyHtml ?? null,
      bodyText: params.bodyText,
      inReplyTo,
      references: inReplyTo,
      attachments,
    });

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      throw new Error(`Gmail send failed: ${await res.text()}`);
    }
    return;
  }

  // Outlook path: use createReply to get a pre-threaded draft, then update body and send.
  // This preserves the conversation thread in Outlook (vs. creating an unthreaded new message).
  const providerMessageId = last.provider_message_id as string;

  const createReplyRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${providerMessageId}/createReply`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!createReplyRes.ok) {
    throw new Error(`Graph createReply failed: ${await createReplyRes.text()}`);
  }
  const replyDraft = (await createReplyRes.json()) as { id?: string };
  if (!replyDraft.id) throw new Error("Graph createReply draft missing id");
  const draftId = replyDraft.id;

  // Update the draft body with our composed content
  const patchRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${draftId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      body: params.bodyHtml
        ? { contentType: "HTML", content: params.bodyHtml }
        : { contentType: "Text", content: params.bodyText },
    }),
  });
  if (!patchRes.ok) {
    throw new Error(`Graph patch reply draft failed: ${await patchRes.text()}`);
  }

  // Add attachments if any
  for (const att of attachments) {
    const attRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${draftId}/attachments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOutlookAttachment(att)),
      },
    );
    if (!attRes.ok) {
      throw new Error(`Graph attach failed: ${await attRes.text()}`);
    }
  }

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${draftId}/send`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!sendRes.ok) {
    throw new Error(`Graph send reply draft failed: ${await sendRes.text()}`);
  }
}

function extractEmail(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  if (m) {
    return m[1].trim();
  }
  return fromHeader.trim();
}

export async function sendNewEmail(params: {
  userId: string;
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  attachments?: AttachmentInput[];
}): Promise<void> {
  const admin = createAdminClient();
  const { data: acc, error: accErr } = await admin
    .from("accounts")
    .select("id, provider, email_address")
    .eq("id", params.accountId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (accErr || !acc) {
    throw new Error("Account not found or not owned by user");
  }
  const provider = acc.provider as Provider;
  const token = await getValidAccessToken(params.accountId);
  const fromEmail = acc.email_address as string;
  const attachments = params.attachments ?? [];

  if (provider === "gmail") {
    const raw = buildMultipartMime({
      from: fromEmail,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      bodyHtml: params.bodyHtml ?? null,
      bodyText: params.bodyText,
      attachments,
    });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      throw new Error(`Gmail send failed: ${await res.text()}`);
    }
    return;
  }

  // Outlook
  const toRecipients = params.to.map((e) => ({ emailAddress: { address: e.trim() } }));
  const ccRecipients = (params.cc ?? []).map((e) => ({ emailAddress: { address: e.trim() } }));
  const bccRecipients = (params.bcc ?? []).map((e) => ({ emailAddress: { address: e.trim() } }));

  // Outlook with attachments: create draft → attach → send
  if (attachments.length > 0) {
    const draftRes = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: params.subject,
        body: params.bodyHtml
          ? { contentType: "HTML", content: params.bodyHtml }
          : { contentType: "Text", content: params.bodyText },
        toRecipients,
        ...(ccRecipients.length ? { ccRecipients } : {}),
        ...(bccRecipients.length ? { bccRecipients } : {}),
      }),
    });
    if (!draftRes.ok) {
      throw new Error(`Graph create draft failed: ${await draftRes.text()}`);
    }
    const draft = (await draftRes.json()) as { id?: string };
    if (!draft.id) throw new Error("Graph draft missing id");

    for (const att of attachments) {
      const attRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${draft.id}/attachments`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildOutlookAttachment(att)),
        },
      );
      if (!attRes.ok) {
        throw new Error(`Graph attach failed: ${await attRes.text()}`);
      }
    }

    const sendRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${draft.id}/send`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!sendRes.ok) {
      throw new Error(`Graph send draft failed: ${await sendRes.text()}`);
    }
    return;
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: params.bodyHtml
          ? { contentType: "HTML", content: params.bodyHtml }
          : { contentType: "Text", content: params.bodyText },
        toRecipients,
        ...(ccRecipients.length ? { ccRecipients } : {}),
        ...(bccRecipients.length ? { bccRecipients } : {}),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Graph sendMail failed: ${await res.text()}`);
  }
}

export async function archiveThreadRemote(params: { threadId: string; userId: string }): Promise<void> {
  await assertThreadOwner(params.threadId, params.userId);
  const admin = createAdminClient();
  const { data: msgs } = await admin
    .from("messages")
    .select("account_id, provider_message_id")
    .eq("thread_id", params.threadId);
  if (!msgs?.length) {
    return;
  }
  const accIds = [...new Set(msgs.map((m) => m.account_id as string))];
  const { data: accRows } = await admin.from("accounts").select("id, provider").in("id", accIds);
  const provMap = Object.fromEntries(
    (accRows ?? []).map((a) => [a.id as string, a.provider as Provider]),
  );

  // Pre-fetch Outlook archive folder IDs once per account to avoid repeated lookups inside the loop
  const outlookArchiveFolderIds = new Map<string, string>();
  for (const accId of accIds) {
    if (provMap[accId] === "outlook") {
      const token = await getValidAccessToken(accId);
      const folderRes = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/archive", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!folderRes.ok) {
        throw new Error(`Graph archive folder lookup failed: ${await folderRes.text()}`);
      }
      const fj = (await folderRes.json()) as { id?: string };
      if (!fj.id) {
        throw new Error("No archive folder returned from Graph API");
      }
      outlookArchiveFolderIds.set(accId, fj.id);
    }
  }

  for (const m of msgs) {
    const accId = m.account_id as string;
    const mid = m.provider_message_id as string;
    const prov = provMap[accId];
    if (!prov) {
      continue;
    }
    const token = await getValidAccessToken(accId);
    if (prov === "gmail") {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}/modify`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
        },
      );
      if (!res.ok) {
        throw new Error(`Gmail archive failed: ${await res.text()}`);
      }
    } else {
      const archiveFolderId = outlookArchiveFolderIds.get(accId);
      if (!archiveFolderId) {
        throw new Error("No archive folder ID cached for Outlook account");
      }
      const mv = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${mid}/move`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ destinationId: archiveFolderId }),
        },
      );
      if (!mv.ok) {
        throw new Error(`Graph move archive failed: ${await mv.text()}`);
      }
    }
  }
}

export async function deleteThreadRemote(params: { threadId: string; userId: string }): Promise<void> {
  await assertThreadOwner(params.threadId, params.userId);
  const admin = createAdminClient();
  const { data: msgs } = await admin
    .from("messages")
    .select("account_id, provider_message_id")
    .eq("thread_id", params.threadId);
  if (!msgs?.length) {
    return;
  }
  const accIds = [...new Set(msgs.map((m) => m.account_id as string))];
  const { data: accRows } = await admin.from("accounts").select("id, provider").in("id", accIds);
  const provMap = Object.fromEntries(
    (accRows ?? []).map((a) => [a.id as string, a.provider as Provider]),
  );
  for (const m of msgs) {
    const accId = m.account_id as string;
    const mid = m.provider_message_id as string;
    const prov = provMap[accId];
    if (!prov) {
      continue;
    }
    const token = await getValidAccessToken(accId);
    if (prov === "gmail") {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}/trash`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        throw new Error(`Gmail trash failed: ${await res.text()}`);
      }
    } else {
      // Move to Deleted Items folder instead of hard-deleting.
      // Hard DELETE can fail silently when message IDs change after moves,
      // and the next sync re-imports the message. Moving to Deleted Items
      // is what Outlook itself does and is more reliable.
      const folderRes = await fetch(
        "https://graph.microsoft.com/v1.0/me/mailFolders/deleteditems",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!folderRes.ok) {
        // Fallback to hard delete if we can't find Deleted Items folder
        const del = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${mid}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!del.ok) {
          const errText = await del.text();
          // 404 means the message was already deleted or moved — not an error
          if (del.status !== 404) {
            throw new Error(`Graph delete failed: ${errText}`);
          }
        }
      } else {
        const folder = (await folderRes.json()) as { id?: string };
        if (folder.id) {
          const mv = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${mid}/move`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ destinationId: folder.id }),
            },
          );
          if (!mv.ok) {
            const errText = await mv.text();
            // 404 means the message was already deleted or moved — not an error
            if (mv.status !== 404) {
              throw new Error(`Graph move to deleted items failed: ${errText}`);
            }
          }
        }
      }
    }
  }
}
