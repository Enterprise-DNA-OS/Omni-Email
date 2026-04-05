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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: draft, error } = await supabase
    .from("drafts")
    .select(
      "id, account_id, thread_id, message_id, to_recipients, cc_recipients, bcc_recipients, subject, body_html, body_text, tone, source, status, created_at, updated_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  return NextResponse.json({ draft });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("drafts")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if ((existing.status as string) !== "draft") {
    return NextResponse.json(
      { error: "Only drafts with status='draft' can be updated" },
      { status: 409 },
    );
  }

  let updates: Record<string, unknown> = {};
  try {
    const body = (await request.json()) as {
      toRecipients?: unknown[];
      ccRecipients?: unknown[];
      bccRecipients?: unknown[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      tone?: string;
    };

    if (Array.isArray(body.toRecipients)) updates.to_recipients = body.toRecipients;
    if (Array.isArray(body.ccRecipients)) updates.cc_recipients = body.ccRecipients;
    if (Array.isArray(body.bccRecipients)) updates.bcc_recipients = body.bccRecipients;
    if (typeof body.subject === "string") updates.subject = body.subject.trim() || null;
    if (typeof body.bodyHtml === "string") updates.body_html = body.bodyHtml.trim() || null;
    if (typeof body.bodyText === "string") updates.body_text = body.bodyText.trim() || null;
    if (
      body.tone &&
      (VALID_TONES as readonly string[]).includes(body.tone)
    ) {
      updates.tone = body.tone;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data: updated, error: uErr } = await admin
    .from("drafts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (uErr || !updated) {
    return NextResponse.json(
      { error: uErr?.message ?? "Update failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ draft: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership first
  const { data: existing } = await supabase
    .from("drafts")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error: uErr } = await admin
    .from("drafts")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
