import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/scheduled/[id]
 * Cancel a queued scheduled message.
 * Body: { action: "cancel" }
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    (body as Record<string, unknown>).action !== "cancel"
  ) {
    return NextResponse.json({ error: 'Body must be { action: "cancel" }' }, { status: 400 });
  }

  // Verify the message exists, belongs to the user, and is still queued
  const { data: existing, error: fetchErr } = await supabase
    .from("scheduled_messages")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Scheduled message not found" }, { status: 404 });
  }
  if ((existing.status as string) !== "queued") {
    return NextResponse.json(
      { error: `Cannot cancel a message with status '${existing.status as string}'` },
      { status: 409 },
    );
  }

  const { error: updateErr } = await supabase
    .from("scheduled_messages")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PUT /api/scheduled/[id]
 * Edit a queued scheduled message.
 * Only allowed while status is 'queued'. Accepts the same fields as POST /api/compose/schedule
 * (minus accountId, which cannot be changed after creation).
 *
 * Body (all fields optional, only provided fields are updated):
 *   sendAt     — ISO-8601 timestamp (must be in the future)
 *   to         — array of email strings
 *   cc         — array of email strings
 *   bcc        — array of email strings
 *   subject    — string
 *   bodyHtml   — string
 *   bodyText   — string
 */
export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

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

  // Verify the message exists, belongs to the user, and is still queued
  const { data: existing, error: fetchErr } = await supabase
    .from("scheduled_messages")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Scheduled message not found" }, { status: 404 });
  }
  if ((existing.status as string) !== "queued") {
    return NextResponse.json(
      { error: `Cannot edit a message with status '${existing.status as string}'` },
      { status: 409 },
    );
  }

  // Build the update patch — only include fields that were supplied
  const patch: Record<string, unknown> = {};

  if ("sendAt" in b) {
    if (typeof b.sendAt !== "string") {
      return NextResponse.json({ error: "sendAt must be a string" }, { status: 400 });
    }
    const sendAt = new Date(b.sendAt);
    if (isNaN(sendAt.getTime())) {
      return NextResponse.json({ error: "Invalid sendAt — must be a valid ISO-8601 timestamp" }, { status: 400 });
    }
    if (sendAt <= new Date()) {
      return NextResponse.json({ error: "sendAt must be in the future" }, { status: 400 });
    }
    patch.send_at = sendAt.toISOString();
  }

  if ("to" in b) {
    if (!Array.isArray(b.to)) {
      return NextResponse.json({ error: "to must be an array" }, { status: 400 });
    }
    const to = (b.to as unknown[]).filter((v) => typeof v === "string") as string[];
    if (to.length === 0) {
      return NextResponse.json({ error: "to must contain at least one recipient" }, { status: 400 });
    }
    patch.to_recipients = to;
  }

  if ("cc" in b) {
    if (!Array.isArray(b.cc)) {
      return NextResponse.json({ error: "cc must be an array" }, { status: 400 });
    }
    patch.cc = (b.cc as unknown[]).filter((v) => typeof v === "string") as string[];
  }

  if ("bcc" in b) {
    if (!Array.isArray(b.bcc)) {
      return NextResponse.json({ error: "bcc must be an array" }, { status: 400 });
    }
    patch.bcc = (b.bcc as unknown[]).filter((v) => typeof v === "string") as string[];
  }

  if ("subject" in b) {
    if (typeof b.subject !== "string") {
      return NextResponse.json({ error: "subject must be a string" }, { status: 400 });
    }
    patch.subject = b.subject.trim();
  }

  if ("bodyHtml" in b) {
    patch.body_html = typeof b.bodyHtml === "string" ? b.bodyHtml : null;
  }

  if ("bodyText" in b) {
    patch.body_text = typeof b.bodyText === "string" ? b.bodyText : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("scheduled_messages")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}
