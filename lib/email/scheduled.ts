import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { sendNewEmail, sendReply } from "@/lib/email/outbound";

type ScheduledRow = {
  id: string;
  user_id: string;
  account_id: string;
  thread_id: string | null;
  to_recipients: string[];
  cc: string[] | null;
  bcc: string[] | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  send_at: string;
  status: "queued" | "sent" | "cancelled" | "failed";
};

/**
 * Process all scheduled messages whose send_at has passed.
 * For each message: attempt send, then update status to 'sent' or 'failed'.
 * Returns the number of messages processed.
 */
export async function processScheduledMessages(): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error: fetchErr } = await admin
    .from("scheduled_messages")
    .select(
      "id, user_id, account_id, thread_id, to_recipients, cc, bcc, subject, body_html, body_text, send_at, status",
    )
    .eq("status", "queued")
    .lte("send_at", now)
    .limit(20);

  if (fetchErr) {
    throw new Error(`processScheduledMessages fetch failed: ${fetchErr.message}`);
  }

  const rows = (due ?? []) as ScheduledRow[];
  if (rows.length === 0) {
    return 0;
  }

  let processed = 0;

  for (const msg of rows) {
    let sendError: string | null = null;

    try {
      if (msg.thread_id) {
        // Reply to an existing thread
        await sendReply({
          threadId: msg.thread_id,
          userId: msg.user_id,
          accountId: msg.account_id,
          bodyText: msg.body_text ?? "",
          bodyHtml: msg.body_html ?? null,
        });
      } else {
        // New email — subject and at least one recipient are required
        const toList = Array.isArray(msg.to_recipients) ? msg.to_recipients : [];
        if (toList.length === 0) {
          throw new Error("No recipients");
        }
        await sendNewEmail({
          userId: msg.user_id,
          accountId: msg.account_id,
          to: toList,
          cc: Array.isArray(msg.cc) ? msg.cc : [],
          bcc: Array.isArray(msg.bcc) ? msg.bcc : [],
          subject: msg.subject ?? "(no subject)",
          bodyText: msg.body_text ?? "",
          bodyHtml: msg.body_html ?? null,
        });
      }
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }

    const newStatus = sendError ? "failed" : "sent";

    const { error: updateErr } = await admin
      .from("scheduled_messages")
      .update({
        status: newStatus,
        ...(sendError ? { error_message: sendError } : {}),
      })
      .eq("id", msg.id);

    if (updateErr) {
      // Log but keep going — don't let one update failure abort the rest
      console.error(`processScheduledMessages: status update failed for ${msg.id}: ${updateErr.message}`);
    }

    await logAuditEvent({
      userId: msg.user_id,
      actor: "system",
      action: newStatus === "sent" ? "scheduled_send" : "scheduled_send_failed",
      targetType: "scheduled_message",
      targetId: msg.id,
      details: sendError ? { error: sendError } : {},
      reversible: false,
    }).catch((e) => {
      console.error(`processScheduledMessages: audit log failed for ${msg.id}: ${e}`);
    });

    processed++;
  }

  return processed;
}
