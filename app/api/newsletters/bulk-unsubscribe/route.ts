import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNewEmail } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";

type UnsubscribeMethod = "mailto" | "https" | "list-unsubscribe-post" | "manual";
type UnsubscribeStatus = "pending" | "sent" | "confirmed" | "failed";

interface BulkUnsubscribeBody {
  senderEmails: string[];
}

interface SenderResult {
  senderEmail: string;
  success: boolean;
  method: UnsubscribeMethod | null;
  error?: string;
}

interface ThreadRow {
  id: string;
  list_unsubscribe: string | null;
  sender_email: string | null;
  primary_account_id: string | null;
}

function parseListUnsubscribeHeader(header: string): string[] {
  const matches = header.match(/<([^>]+)>/g);
  if (!matches) return [header.trim()];
  return matches.map((m) => m.slice(1, -1).trim()).filter(Boolean);
}

async function createLogEntry(params: {
  userId: string;
  senderEmail: string;
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
      unsubscribed_at:
        params.status === "sent" || params.status === "confirmed"
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

async function updateLogStatus(
  logId: string,
  status: UnsubscribeStatus,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("unsubscribe_log")
    .update({
      status,
      unsubscribed_at:
        status === "sent" || status === "confirmed"
          ? new Date().toISOString()
          : undefined,
    })
    .eq("id", logId);
}

async function unsubscribeFromSender(
  userId: string,
  senderEmail: string,
  thread: ThreadRow,
): Promise<{ success: boolean; method: UnsubscribeMethod | null; error?: string }> {
  const storedHeader = thread.list_unsubscribe;
  if (!storedHeader) {
    return { success: false, method: null, error: "No List-Unsubscribe header" };
  }

  const senderDomain = senderEmail.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? null;

  const postHeaderMatch = storedHeader.match(/\nList-Unsubscribe-Post:\s*(.+)$/);
  const rawHeader = postHeaderMatch
    ? storedHeader.slice(0, postHeaderMatch.index)
    : storedHeader;
  const hasOneClickPost = Boolean(postHeaderMatch);

  const candidates = parseListUnsubscribeHeader(rawHeader);
  const httpsUrl = candidates.find(
    (c) => c.startsWith("https://") || c.startsWith("http://"),
  );
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
    return {
      success: false,
      method: null,
      error: "No usable unsubscribe target in header",
    };
  }

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
      const accountId = thread.primary_account_id;
      if (!accountId) {
        throw new Error("Thread has no primary_account_id");
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
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      finalStatus = res.ok ? "confirmed" : "failed";
    } else {
      const res = await fetch(targetUrl, { method: "GET" });
      finalStatus =
        res.ok || (res.status >= 300 && res.status < 400) ? "confirmed" : "failed";
    }
  } catch (execErr) {
    console.error("Bulk unsubscribe execution error:", execErr);
    finalStatus = "failed";
  }

  await updateLogStatus(logId, finalStatus);

  try {
    await logAuditEvent({
      userId,
      actor: "user",
      action: "thread.unsubscribe",
      targetType: "thread",
      targetId: thread.id,
      details: {
        method,
        status: finalStatus,
        senderEmail,
        senderDomain,
        unsubscribeLogId: logId,
        bulk: true,
      },
      reversible: false,
    });
  } catch {
    // Non-fatal
  }

  const success = finalStatus === "sent" || finalStatus === "confirmed";
  return { success, method };
}

/**
 * POST /api/newsletters/bulk-unsubscribe
 *
 * Bulk unsubscribe from multiple senders.
 * Body: { senderEmails: string[] }
 * Returns: { results: [{ senderEmail, success, method, error? }] }
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BulkUnsubscribeBody;
  try {
    body = (await request.json()) as BulkUnsubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { senderEmails } = body;
  if (!Array.isArray(senderEmails) || senderEmails.length === 0) {
    return NextResponse.json(
      { error: "senderEmails must be a non-empty array" },
      { status: 400 },
    );
  }

  if (senderEmails.length > 50) {
    return NextResponse.json(
      { error: "Cannot unsubscribe from more than 50 senders at once" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // For each sender, find the most recent thread with a List-Unsubscribe header
  const results: SenderResult[] = await Promise.all(
    senderEmails.map(async (senderEmail) => {
      try {
        const { data: thread, error: tErr } = await admin
          .from("threads")
          .select("id, list_unsubscribe, sender_email, primary_account_id")
          .eq("user_id", user.id)
          .ilike("sender_email", senderEmail)
          .not("list_unsubscribe", "is", null)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tErr || !thread) {
          return {
            senderEmail,
            success: false,
            method: null,
            error: "No thread with unsubscribe header found",
          };
        }

        const outcome = await unsubscribeFromSender(
          user.id,
          senderEmail,
          thread as ThreadRow,
        );
        return { senderEmail, ...outcome };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { senderEmail, success: false, method: null, error: message };
      }
    }),
  );

  return NextResponse.json({ results });
}
