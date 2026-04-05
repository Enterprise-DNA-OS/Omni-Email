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
  const date = url.searchParams.get("date");

  let query = supabase
    .from("daily_summaries")
    .select("id, summary_date, content, generated_at")
    .eq("user_id", user.id);

  if (date) {
    query = query.eq("summary_date", date);
  } else {
    query = query.order("summary_date", { ascending: false });
  }

  const { data: summary, error } = await query.limit(1).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!summary) {
    return NextResponse.json({ summary: null });
  }

  return NextResponse.json({ summary });
}
