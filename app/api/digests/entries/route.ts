import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const offsetParam = url.searchParams.get("offset");
  const limitParam = url.searchParams.get("limit");
  const configId = url.searchParams.get("configId");

  const offset = Math.max(0, Number(offsetParam ?? "0") || 0);
  const limit = Math.min(Math.max(1, Number(limitParam ?? "20") || 20), 50);

  let query = supabase
    .from("digest_entries")
    .select(
      "id, digest_config_id, title, summary, thread_count, period_start, period_end, status, generated_at, delivered, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (configId) {
    query = query.eq("digest_config_id", configId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    entries: data ?? [],
    nextOffset: (data ?? []).length === limit ? offset + limit : null,
  });
}
