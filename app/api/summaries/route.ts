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
  const dateParam = url.searchParams.get("date");
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(1, Number(limitParam ?? "30") || 30), 90);

  let query = supabase
    .from("daily_summaries")
    .select("id, summary_date, content, generated_at")
    .eq("user_id", user.id)
    .order("summary_date", { ascending: false })
    .limit(limit);

  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam) || isNaN(Date.parse(dateParam))) {
      return NextResponse.json(
        { error: "date must be in YYYY-MM-DD format" },
        { status: 400 },
      );
    }
    query = query.eq("summary_date", dateParam);
  }

  const { data: summaries, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summaries: summaries ?? [] });
}
