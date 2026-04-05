import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limitParam = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const limit = isNaN(limitParam) || limitParam < 1 ? DEFAULT_LIMIT : Math.min(limitParam, MAX_LIMIT);
  const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;

  // Validate actor if provided
  if (actor && !["user", "system", "rule"].includes(actor)) {
    return NextResponse.json({ error: "Invalid actor value" }, { status: 400 });
  }

  let query = supabase
    .from("audit_log")
    .select("id, actor, action, target_type, target_id, details, reversible, undone_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actor) query = query.eq("actor", actor);
  if (action) query = query.eq("action", action);
  if (targetType) query = query.eq("target_type", targetType);
  if (targetId) query = query.eq("target_id", targetId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
