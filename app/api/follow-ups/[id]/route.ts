import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

type AllowedStatus = "waiting" | "followed_up" | "replied" | "cancelled";
const ALLOWED_STATUSES: AllowedStatus[] = ["waiting", "followed_up", "replied", "cancelled"];

/**
 * PATCH /api/follow-ups/:id
 *
 * Update a follow_up record. Supported fields:
 *   - status: "waiting" | "followed_up" | "replied" | "cancelled"
 *   - next_follow_up_at: ISO timestamp
 *   - max_follow_ups: integer
 *
 * DELETE /api/follow-ups/:id
 *
 * Hard-delete a follow_up record owned by the authenticated user.
 */

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build a safe update payload from only the fields we allow callers to change
  const update: Record<string, unknown> = {};

  if ("status" in body) {
    if (!ALLOWED_STATUSES.includes(body.status as AllowedStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    update.status = body.status;
  }

  if ("next_follow_up_at" in body) {
    if (typeof body.next_follow_up_at !== "string") {
      return NextResponse.json({ error: "next_follow_up_at must be an ISO string" }, { status: 400 });
    }
    update.next_follow_up_at = body.next_follow_up_at;
  }

  if ("max_follow_ups" in body) {
    const n = Number(body.max_follow_ups);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "max_follow_ups must be a non-negative integer" }, { status: 400 });
    }
    update.max_follow_ups = n;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify ownership before writing
  const { data: existing } = await admin
    .from("follow_ups")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: updated, error: uErr } = await admin
    .from("follow_ups")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (uErr || !updated) {
    return NextResponse.json({ error: uErr?.message ?? "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
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

  const admin = createAdminClient();

  // Verify ownership first
  const { data: existing } = await admin
    .from("follow_ups")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: dErr } = await admin.from("follow_ups").delete().eq("id", id);
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
