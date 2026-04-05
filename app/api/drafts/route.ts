import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_TONES = [
  "professional",
  "friendly",
  "brief",
  "concise",
  "warm",
  "executive",
  "support",
  "sales",
  "legal_safe",
  "detailed",
  "casual",
] as const;

type Tone = (typeof VALID_TONES)[number];

const VALID_STATUSES = ["draft", "sent", "discarded"] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "draft";
  const threadId = url.searchParams.get("threadId");

  const status: Status = (VALID_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as Status)
    : "draft";

  let query = supabase
    .from("drafts")
    .select(
      "id, account_id, thread_id, message_id, to_recipients, cc_recipients, bcc_recipients, subject, body_html, body_text, tone, source, status, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (threadId) {
    query = query.eq("thread_id", threadId);
  }

  const { data: drafts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drafts: drafts ?? [] });
}

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
  let threadId = "";
  let messageId: string | null = null;
  let toRecipients: unknown[] = [];
  let ccRecipients: unknown[] = [];
  let bccRecipients: unknown[] = [];
  let subject: string | null = null;
  let bodyHtml: string | null = null;
  let bodyText: string | null = null;
  let tone: Tone = "professional";

  try {
    const body = (await request.json()) as {
      accountId?: string;
      threadId?: string;
      messageId?: string;
      toRecipients?: unknown[];
      ccRecipients?: unknown[];
      bccRecipients?: unknown[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      tone?: string;
    };
    accountId = body.accountId?.trim() ?? "";
    threadId = body.threadId?.trim() ?? "";
    messageId = body.messageId?.trim() || null;
    toRecipients = Array.isArray(body.toRecipients) ? body.toRecipients : [];
    ccRecipients = Array.isArray(body.ccRecipients) ? body.ccRecipients : [];
    bccRecipients = Array.isArray(body.bccRecipients) ? body.bccRecipients : [];
    subject = body.subject?.trim() || null;
    bodyHtml = body.bodyHtml?.trim() || null;
    bodyText = body.bodyText?.trim() || null;
    if (body.tone && (VALID_TONES as readonly string[]).includes(body.tone)) {
      tone = body.tone as Tone;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!accountId || !threadId) {
    return NextResponse.json(
      { error: "accountId and threadId are required" },
      { status: 400 },
    );
  }

  // Verify thread ownership
  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Verify account ownership
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: draft, error: iErr } = await admin
    .from("drafts")
    .insert({
      user_id: user.id,
      account_id: accountId,
      thread_id: threadId,
      message_id: messageId,
      to_recipients: toRecipients,
      cc_recipients: ccRecipients,
      bcc_recipients: bccRecipients,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      tone,
      source: "user",
      status: "draft",
    })
    .select()
    .single();

  if (iErr || !draft) {
    return NextResponse.json(
      { error: iErr?.message ?? "Failed to create draft" },
      { status: 500 },
    );
  }

  return NextResponse.json({ draft }, { status: 201 });
}
