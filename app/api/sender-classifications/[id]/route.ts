import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_CLASSIFICATIONS = ["vip", "safe", "blocked", "never_auto_send"] as const;
type Classification = (typeof VALID_CLASSIFICATIONS)[number];

function isValidClassification(value: unknown): value is Classification {
  return VALID_CLASSIFICATIONS.includes(value as Classification);
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { classification?: unknown; notes?: unknown; email_or_domain?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.classification !== undefined) {
    if (!isValidClassification(body.classification)) {
      return NextResponse.json(
        { error: `classification must be one of: ${VALID_CLASSIFICATIONS.join(", ")}` },
        { status: 400 },
      );
    }
    updates.classification = body.classification;
  }

  if (body.email_or_domain !== undefined) {
    const val = typeof body.email_or_domain === "string" ? body.email_or_domain.toLowerCase().trim() : "";
    if (!val) {
      return NextResponse.json({ error: "email_or_domain cannot be empty" }, { status: 400 });
    }
    updates.email_or_domain = val;
  }

  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sender_classifications")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, email_or_domain, classification, notes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ sender_classification: data });
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("sender_classifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
