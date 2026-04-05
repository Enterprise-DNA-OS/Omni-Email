/**
 * Auto-Forward (Feature 2.10)
 *
 * Implements email forwarding for both Gmail and Outlook providers.
 * Used by the rules engine when a "forward" action is triggered.
 *
 * Gmail: builds a MIME message and posts to messages/send
 * Outlook: uses the /messages/{id}/forward Graph API endpoint
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/email/sync";
import { buildMultipartMime } from "@/lib/email/mime";
import { logAuditEvent } from "@/lib/audit/log";
import { stripHtml } from "@/lib/ai/client";

type Provider = "gmail" | "outlook";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the plain-text forward body with original message quoted below */
function buildForwardBody(
  subject: string,
  originalSender: string,
  originalAt: string,
  originalBody: string,
): string {
  const date = new Date(originalAt).toLocaleString();
  return (
    `---------- Forwarded message ----------\n` +
    `From: ${originalSender}\n` +
    `Date: ${date}\n` +
    `Subject: ${subject}\n\n` +
    originalBody.trim()
  );
}

// ---------------------------------------------------------------------------
// executeForward
// ---------------------------------------------------------------------------

/**
 * Forward a thread's most recent message to a given address.
 *
 * @param threadId  - The thread to forward
 * @param accountId - The sending account (must belong to userId)
 * @param toAddress - Recipient email address
 * @param userId    - Owner of the thread and account
 */
export async function executeForward(
  threadId: string,
  accountId: string,
  toAddress: string,
  userId: string,
): Promise<void> {
  if (!toAddress || !toAddress.includes("@")) {
    throw new Error(`auto-forward: invalid toAddress "${toAddress}"`);
  }

  const admin = createAdminClient();

  // Verify account ownership
  const { data: account, error: accErr } = await admin
    .from("accounts")
    .select("id, provider, email_address")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accErr || !account) {
    throw new Error("auto-forward: account not found or not owned by user");
  }

  const provider = account.provider as Provider;
  const fromEmail = account.email_address as string;

  // Verify thread ownership
  const { data: thread, error: tErr } = await admin
    .from("threads")
    .select("id, subject")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (tErr || !thread) {
    throw new Error("auto-forward: thread not found or not owned by user");
  }

  const subject = (thread.subject as string | null) ?? "(no subject)";
  const fwdSubject = subject.toLowerCase().startsWith("fwd:")
    ? subject
    : `Fwd: ${subject}`;

  // Load the most recent message for forward content
  const { data: lastMessage } = await admin
    .from("messages")
    .select("id, sender, body_text, body_html, message_at, provider_message_id")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastMessage) {
    throw new Error("auto-forward: no messages found in thread");
  }

  const originalSender = (lastMessage.sender as string | null) ?? "Unknown";
  const originalAt = (lastMessage.message_at as string) ?? new Date().toISOString();
  const originalBody =
    (lastMessage.body_text as string | null) ||
    (lastMessage.body_html ? stripHtml(lastMessage.body_html as string) : "(no content)");

  const forwardBody = buildForwardBody(subject, originalSender, originalAt, originalBody);

  // Build HTML variant with simple quoted block
  const forwardHtml =
    `<p></p>` +
    `<div class="gmail_quote">` +
    `<p>---------- Forwarded message ----------<br>` +
    `From: ${originalSender}<br>` +
    `Date: ${new Date(originalAt).toLocaleString()}<br>` +
    `Subject: ${subject}</p>` +
    (lastMessage.body_html
      ? (lastMessage.body_html as string)
      : `<pre>${originalBody}</pre>`) +
    `</div>`;

  const token = await getValidAccessToken(accountId);

  if (provider === "gmail") {
    // buildMultipartMime already returns a base64url-encoded string — use it directly.
    const raw = buildMultipartMime({
      from: fromEmail,
      to: [toAddress.trim()],
      subject: fwdSubject,
      bodyText: forwardBody,
      bodyHtml: forwardHtml,
    });

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`auto-forward: Gmail send failed: ${text}`);
    }
  } else {
    // Outlook: use the /forward action on the provider message for best compatibility,
    // falling back to sendMail if provider_message_id is unavailable.
    const providerMessageId = lastMessage.provider_message_id as string | null;

    if (providerMessageId) {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${providerMessageId}/forward`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            toRecipients: [{ emailAddress: { address: toAddress.trim() } }],
            comment: "",
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`auto-forward: Outlook forward failed: ${text}`);
      }
    } else {
      // Fallback: compose a new message
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: fwdSubject,
            body: { contentType: "HTML", content: forwardHtml },
            toRecipients: [{ emailAddress: { address: toAddress.trim() } }],
          },
          saveToSentItems: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`auto-forward: Outlook sendMail failed: ${text}`);
      }
    }
  }

  // Log to audit_log
  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.forwarded",
    targetType: "thread",
    targetId: threadId,
    details: { toAddress, accountId, provider, subject: fwdSubject },
    reversible: false,
  });
}
