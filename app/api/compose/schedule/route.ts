import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ScheduleBody {
  accountId: string;
  sendAt: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  threadId?: string;
}

/**
 * POST /api/compose/schedule
 * Creates a scheduled message that will be sent when send_at passes.
 *
 * Body (JSON):
 *   accountId  — required
 *   sendAt     — required ISO-8601 timestamp (must be in the future)
 *   to         — required non-empty array of email strings
 *   cc         — optional array
 *   bcc        — optional array
 *   subject    — optional (required when threadId is absent)
 *   bodyHtml   — optional
 *   bodyText   — optional
 *   threadId   — optional; when present this is a scheduled reply
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const accountId = typeof b.accountId === "string" ? b.accountId.trim() : "";
  const sendAtRaw = typeof b.sendAt === "string" ? b.sendAt.trim() : "";
  const to = Array.isArray(b.to) ? (b.to as unknown[]).filter((v) => typeof v === "string") as string[] : [];
  const cc = Array.isArray(b.cc) ? (b.cc as unknown[]).filter((v) => typeof v === "string") as string[] : [];
  const bcc = Array.isArray(b.bcc) ? (b.bcc as unknown[]).filter((v) => typeof v === "string") as string[] : [];
  const subject = typeof b.subject === "string" ? b.subject.trim() : null;
  const bodyHtml = typeof b.bodyHtml === "string" ? b.bodyHtml : null;
  const bodyText = typeof b.bodyText === "string" ? b.bodyText : null;
  const threadId = typeof b.threadId === "string" ? b.threadId.trim() : null;

  if (!accountId) {
    return NextResponse.json({ error: "Missing required field: accountId" }, { status: 400 });
  }
  if (!sendAtRaw) {
    return NextResponse.json({ error: "Missing required field: sendAt" }, { status: 400 });
  }

  const sendAt = new Date(sendAtRaw);
  if (isNaN(sendAt.getTime())) {
    return NextResponse.json({ error: "Invalid sendAt — must be a valid ISO-8601 timestamp" }, { status: 400 });
  }
  if (sendAt <= new Date()) {
    return NextResponse.json({ error: "sendAt must be in the future" }, { status: 400 });
  }

  if (!threadId && to.length === 0) {
    return NextResponse.json({ error: "to must contain at least one recipient for new messages" }, { status: 400 });
  }
  if (!threadId && !subject) {
    return NextResponse.json({ error: "subject is required for new messages" }, { status: 400 });
  }
  if (!bodyText && !bodyHtml) {
    return NextResponse.json({ error: "At least one of bodyText or bodyHtml is required" }, { status: 400 });
  }

  // Verify the account belongs to the authenticated user
  const { data: acc, error: accErr } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accErr || !acc) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Verify thread ownership if threadId is provided
  if (threadId) {
    const { data: th, error: thErr } = await supabase
      .from("threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (thErr || !th) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("scheduled_messages")
    .insert({
      user_id: user.id,
      account_id: accountId,
      thread_id: threadId ?? null,
      to_recipients: to,
      cc,
      bcc,
      subject: subject ?? null,
      body_html: bodyHtml,
      body_text: bodyText,
      send_at: sendAt.toISOString(),
      status: "queued",
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: inserted }, { status: 201 });
}
