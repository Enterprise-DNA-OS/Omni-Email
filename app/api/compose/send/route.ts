import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendNewEmail } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import type { AttachmentInput } from "@/lib/email/mime";

/** 25 MB hard limit for total attachment payload */
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
/** Maximum number of attached files */
const MAX_FILE_COUNT = 20;

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accountId = "";
  let to = "";
  let cc = "";
  let bcc = "";
  let subject = "";
  let bodyText = "";
  let bodyHtml: string | null = null;
  let attachments: AttachmentInput[] = [];

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    // Parse multipart form — fields + file attachments
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    accountId = (form.get("accountId") as string | null)?.trim() ?? "";
    to = (form.get("to") as string | null)?.trim() ?? "";
    cc = (form.get("cc") as string | null)?.trim() ?? "";
    bcc = (form.get("bcc") as string | null)?.trim() ?? "";
    subject = (form.get("subject") as string | null)?.trim() ?? "";
    bodyText = (form.get("bodyText") as string | null)?.trim() ?? "";
    bodyHtml = (form.get("bodyHtml") as string | null)?.trim() || null;

    const files = form.getAll("attachments") as File[];

    if (files.length > MAX_FILE_COUNT) {
      return NextResponse.json(
        { error: `Too many attachments (max ${MAX_FILE_COUNT})` },
        { status: 400 },
      );
    }

    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { error: "Total attachment size exceeds 25 MB limit" },
          { status: 400 },
        );
      }
      const arrayBuf = await file.arrayBuffer();
      attachments.push({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        content: Buffer.from(arrayBuf),
      });
    }
  } else {
    // JSON path (backward-compatible, no attachments)
    try {
      const body = (await request.json()) as {
        accountId?: string;
        to?: string;
        cc?: string;
        bcc?: string;
        subject?: string;
        bodyText?: string;
        bodyHtml?: string;
      };
      accountId = body.accountId?.trim() ?? "";
      to = body.to?.trim() ?? "";
      cc = body.cc?.trim() ?? "";
      bcc = body.bcc?.trim() ?? "";
      subject = body.subject?.trim() ?? "";
      bodyText = body.bodyText?.trim() ?? "";
      bodyHtml = body.bodyHtml?.trim() || null;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  if (!accountId || !to || !subject || !bodyText) {
    return NextResponse.json(
      { error: "accountId, to, subject, and bodyText are required" },
      { status: 400 },
    );
  }

  const toList = to.split(",").map((e) => e.trim()).filter(Boolean);
  const ccList = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : [];
  const bccList = bcc ? bcc.split(",").map((e) => e.trim()).filter(Boolean) : [];

  try {
    await sendNewEmail({
      userId: user.id,
      accountId,
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      subject,
      bodyText,
      bodyHtml,
      attachments: attachments.length ? attachments : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "email.send",
    targetType: "account",
    targetId: undefined,
    details: { accountId, to: toList, subject, attachmentCount: attachments.length },
    reversible: false,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
