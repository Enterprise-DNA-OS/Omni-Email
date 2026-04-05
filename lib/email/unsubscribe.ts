/**
 * Auto-Unsubscribe executor (Feature 2.3)
 *
 * Parses the List-Unsubscribe header from a thread and executes the appropriate
 * unsubscribe method: mailto, HTTPS one-click POST, or plain HTTPS GET.
 * Results are written to unsubscribe_log and audit_log.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendNewEmail } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";

type UnsubscribeMethod = "mailto" | "https" | "list-unsubscribe-post" | "manual";
type UnsubscribeStatus = "pending" | "sent" | "confirmed" | "failed";

interface UnsubscribeResult {
  method: UnsubscribeMethod;
  status: UnsubscribeStatus;
  logId: string;
}

/**
 * Parse a List-Unsubscribe header value into its constituent URLs/addresses.
 * The header can contain multiple comma-separated entries wrapped in angle brackets,
 * e.g. `<mailto:unsub@example.com>, <https://example.com/unsub?id=123>`
 */
function parseListUnsubscribeHeader(header: string): string[] {
  const matches = header.match(/<([^>]+)>/g);
  if (!matches) {
    // Fallback: treat the whole string as a single URL/address
    return [header.trim()];
  }
  return matches.map((m) => m.slice(1, -1).trim()).filter(Boolean);
}

function extractSenderDomain(senderEmail: string | null): string | null {
  if (!senderEmail) return null;
  const match = senderEmail.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Write a row to unsubscribe_log using the admin client.
 */
async function createLogEntry(params: {
  userId: string;
  senderEmail: string | null;
  senderDomain: string | null;
  method: UnsubscribeMethod;
  status: UnsubscribeStatus;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("unsubscribe_log")
    .insert({
      user_id: params.userId,
      sender_email: params.senderEmail,
      sender_domain: params.senderDomain,
      method: params.method,
      status: params.status,
      unsubscribed_at: params.status === "sent" || params.status === "confirmed"
        ? new Date().toISOString()
        : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`unsubscribe_log insert failed: ${error?.message ?? "unknown"}`);
  }
  return data.id as string;
}

/**
 * Update the status of an existing unsubscribe_log entry.
 */
async function updateLogStatus(logId: string, status: UnsubscribeStatus): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("unsubscribe_log")
    .update({
      status,
      unsubscribed_at:
        status === "sent" || status === "confirmed" ? new Date().toISOString() : undefined,
    })
    .eq("id", logId);
}

/**
 * Execute an unsubscribe for the thread identified by threadId.
 *
 * Steps:
 *  1. Load thread.list_unsubscribe + sender_email from the DB
 *  2. Determine the best unsubscribe method from the parsed header
 *  3. Execute:
 *     - mailto → send an unsubscribe email via the account's outbound pipeline
 *     - https + List-Unsubscribe-Post header → one-click POST
 *     - https only → plain GET
 *  4. Record result in unsubscribe_log and audit_log
 */
export async function executeUnsubscribe(
  userId: string,
  threadId: string,
): Promise<UnsubscribeResult> {
  const admin = createAdminClient();

  // 1. Load thread
  const { data: thread, error: tErr } = await admin
    .from("threads")
    .select("id, list_unsubscribe, sender_email, primary_account_id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (tErr || !thread) {
    throw new Error(`Thread ${threadId} not found or not owned by user`);
  }

  const storedHeader = thread.list_unsubscribe as string | null;
  if (!storedHeader) {
    throw new Error("Thread has no List-Unsubscribe header — cannot auto-unsubscribe");
  }

  const senderEmail = thread.sender_email as string | null;
  const senderDomain = extractSenderDomain(senderEmail);

  // 2. Parse the stored column value.
  // During sync we encode both headers into the single column using the format:
  //   "<original List-Unsubscribe value>\nList-Unsubscribe-Post: <post value>"
  // Split on the sentinel line to recover both parts.
  const postHeaderMatch = storedHeader.match(/\nList-Unsubscribe-Post:\s*(.+)$/);
  const rawHeader = postHeaderMatch
    ? storedHeader.slice(0, postHeaderMatch.index)
    : storedHeader;
  const hasOneClickPost = Boolean(postHeaderMatch);

  const candidates = parseListUnsubscribeHeader(rawHeader);

  // Prefer HTTPS over mailto when both are available (RFC 8058 one-click is preferred)
  const httpsUrl = candidates.find((c) => c.startsWith("https://") || c.startsWith("http://"));
  const mailtoAddress = candidates.find((c) => c.startsWith("mailto:"));

  let method: UnsubscribeMethod;
  let targetUrl: string;

  if (httpsUrl && hasOneClickPost) {
    method = "list-unsubscribe-post";
    targetUrl = httpsUrl;
  } else if (httpsUrl) {
    method = "https";
    targetUrl = httpsUrl;
  } else if (mailtoAddress) {
    method = "mailto";
    targetUrl = mailtoAddress;
  } else {
    throw new Error("Could not find a usable unsubscribe target in the List-Unsubscribe header");
  }

  // 3. Create initial log entry
  const logId = await createLogEntry({
    userId,
    senderEmail,
    senderDomain,
    method,
    status: "pending",
  });

  let finalStatus: UnsubscribeStatus = "failed";

  try {
    if (method === "mailto") {
      // Send unsubscribe email — strip leading "mailto:" and optional "?subject=..."
      const mailtoRaw = targetUrl.replace(/^mailto:/i, "");
      const [addressPart, queryPart] = mailtoRaw.split("?");
      const toAddress = decodeURIComponent(addressPart.trim());

      let subject = "Unsubscribe";
      if (queryPart) {
        const params = new URLSearchParams(queryPart);
        if (params.get("subject")) {
          subject = decodeURIComponent(params.get("subject")!);
        }
      }

      // Resolve the account to send from
      const accountId = thread.primary_account_id as string | null;
      if (!accountId) {
        throw new Error("Thread has no primary_account_id — cannot determine send account");
      }

      await sendNewEmail({
        userId,
        accountId,
        to: [toAddress],
        subject,
        bodyText: "Please unsubscribe me from this mailing list.",
      });

      finalStatus = "sent";
    } else if (method === "list-unsubscribe-post") {
      // RFC 8058 one-click POST with application/x-www-form-urlencoded body
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      finalStatus = res.ok ? "confirmed" : "failed";
      if (!res.ok) {
        console.warn(`Unsubscribe POST to ${targetUrl} returned ${res.status}`);
      }
    } else {
      // Plain HTTPS GET (fallback)
      const res = await fetch(targetUrl, { method: "GET" });
      // A 2xx or 3xx redirect both indicate the server accepted the request
      finalStatus = res.ok || (res.status >= 300 && res.status < 400) ? "confirmed" : "failed";
      if (!res.ok && res.status < 300) {
        console.warn(`Unsubscribe GET to ${targetUrl} returned ${res.status}`);
      }
    }
  } catch (execErr) {
    console.error("Unsubscribe execution error:", execErr);
    finalStatus = "failed";
  }

  // 4. Persist final status
  await updateLogStatus(logId, finalStatus);

  // 5. Write audit log entry
  try {
    await logAuditEvent({
      userId,
      actor: "user",
      action: "thread.unsubscribe",
      targetType: "thread",
      targetId: threadId,
      details: {
        method,
        status: finalStatus,
        senderEmail,
        senderDomain,
        unsubscribeLogId: logId,
      },
      reversible: false,
    });
  } catch (auditErr) {
    // Non-fatal: unsubscribe succeeded even if audit logging fails
    console.error("Audit log write failed after unsubscribe:", auditErr);
  }

  return { method, status: finalStatus, logId };
}
