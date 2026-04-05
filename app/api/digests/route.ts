import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("digest_config")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configs: data ?? [] });
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

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const frequency = body.frequency ?? "daily";
  if (!["daily", "weekly", "never"].includes(frequency)) {
    return NextResponse.json(
      { error: "frequency must be daily, weekly, or never" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digest_config")
    .insert({
      user_id: user.id,
      name,
      frequency,
      schedule_time: body.schedule_time ?? "08:00",
      schedule_day_of_week: body.schedule_day_of_week ?? null,
      include_categories: body.include_categories ?? [],
      include_tags: body.include_tags ?? [],
      include_senders: body.include_senders ?? [],
      enabled: body.enabled ?? true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data }, { status: 201 });
}
