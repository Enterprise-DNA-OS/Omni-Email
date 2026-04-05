import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/follow-ups
 *
 * Returns the "Waiting On" view: follow_up records for the authenticated user.
 * Supports optional query params:
 *   - status: filter by status (waiting | followed_up | replied | cancelled)
 *   - limit:  max rows (default 50, max 200)
 *   - offset: pagination offset (default 0)
 *
 * POST /api/follow-ups
 *
 * Manually create a follow-up for a thread.
 * Body: { thread_id, account_id, original_message_id?, next_follow_up_at?, max_follow_ups? }
 */

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  let query = supabase
    .from("follow_ups")
    .select(
      `id, thread_id, account_id, original_message_id, follow_up_count,
       next_follow_up_at, max_follow_ups, status, created_at,
       threads(subject, snippet, last_message_at, sender_name, sender_email)`,
    )
    .eq("user_id", user.id)
    .order("next_follow_up_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { thread_id, account_id, original_message_id, next_follow_up_at, max_follow_ups } = body;

  if (typeof thread_id !== "string" || typeof account_id !== "string") {
    return NextResponse.json(
      { error: "thread_id and account_id are required strings" },
      { status: 400 },
    );
  }

  // Verify thread ownership
  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("id", thread_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Verify account ownership
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: inserted, error: iErr } = await admin
    .from("follow_ups")
    .insert({
      user_id: user.id,
      thread_id,
      account_id,
      original_message_id: typeof original_message_id === "string" ? original_message_id : null,
      next_follow_up_at:
        typeof next_follow_up_at === "string"
          ? next_follow_up_at
          : new Date(Date.now() + 3 * 86400_000).toISOString(),
      max_follow_ups: typeof max_follow_ups === "number" ? max_follow_ups : 3,
      status: "waiting",
    })
    .select()
    .single();

  if (iErr || !inserted) {
    return NextResponse.json({ error: iErr?.message ?? "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ data: inserted }, { status: 201 });
}
