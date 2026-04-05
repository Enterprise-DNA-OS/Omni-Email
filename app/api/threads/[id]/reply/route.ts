import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReply } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import type { AttachmentInput } from "@/lib/email/mime";
import { recordSignal } from "@/lib/ai/behavioral-learning";

type Ctx = { params: Promise<{ id: string }> };

/** 25 MB hard limit for total attachment payload */
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
/** Maximum number of attached files */
const MAX_FILE_COUNT = 20;

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read ai_intent before sending so we can record override feedback
  const { data: threadRow } = await supabase
    .from("threads")
    .select("ai_intent")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  const threadAiIntent = (threadRow as { ai_intent?: string | null } | null)?.ai_intent ?? null;

  let bodyText = "";
  let bodyHtml: string | null = null;
  let accountId: string | undefined;
  let attachments: AttachmentInput[] = [];

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    bodyText = (form.get("bodyText") as string | null)?.trim() ?? "";
    bodyHtml = (form.get("bodyHtml") as string | null)?.trim() || null;
    accountId = (form.get("accountId") as string | null)?.trim() || undefined;

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
    try {
      const body = (await request.json()) as { bodyText?: string; bodyHtml?: string | null; accountId?: string };
      bodyText = body.bodyText?.trim() ?? "";
      bodyHtml = body.bodyHtml ?? null;
      accountId = body.accountId || undefined;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  if (!bodyText && !bodyHtml) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  try {
    await sendReply({
      threadId: id,
      userId: user.id,
      bodyText: bodyText || (bodyHtml ? "" : ""),
      bodyHtml,
      accountId,
      attachments: attachments.length ? attachments : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "thread.reply",
    targetType: "thread",
    targetId: id,
    details: { accountId: accountId ?? null, attachmentCount: attachments.length },
    reversible: false,
  }).catch(() => undefined);

  // Record implicit override feedback when user replies to a thread the AI recommended ignoring or archiving
  if (threadAiIntent === "ignore" || threadAiIntent === "archive") {
    const admin = createAdminClient();
    void Promise.resolve(
      admin.from("ai_feedback").insert({
        user_id: user.id,
        thread_id: id,
        feedback_type: "action",
        ai_output: { intent: threadAiIntent },
        user_correction: { actual_action: "reply" },
      }),
    ).catch(() => undefined);
  }

  void recordSignal(user.id, id, "replied").catch(() => undefined);

  return NextResponse.json({ ok: true });
}
