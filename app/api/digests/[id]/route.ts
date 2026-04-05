import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: config, error: configErr } = await supabase
    .from("digest_config")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (configErr || !config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: entries } = await supabase
    .from("digest_entries")
    .select(
      "id, title, summary, thread_count, period_start, period_end, status, generated_at, delivered, created_at",
    )
    .eq("digest_config_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ config, entries: entries ?? [] });
}

export async function PUT(request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    frequency?: string;
    schedule_time?: string;
    schedule_day_of_week?: number | null;
    include_categories?: string[];
    include_tags?: string[];
    include_senders?: string[];
    enabled?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.frequency && !["daily", "weekly", "never"].includes(body.frequency)) {
    return NextResponse.json(
      { error: "frequency must be daily, weekly, or never" },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.frequency !== undefined) updates.frequency = body.frequency;
  if (body.schedule_time !== undefined) updates.schedule_time = body.schedule_time;
  if (body.schedule_day_of_week !== undefined) updates.schedule_day_of_week = body.schedule_day_of_week;
  if (body.include_categories !== undefined) updates.include_categories = body.include_categories;
  if (body.include_tags !== undefined) updates.include_tags = body.include_tags;
  if (body.include_senders !== undefined) updates.include_senders = body.include_senders;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digest_config")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ config: data });
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("digest_config")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
