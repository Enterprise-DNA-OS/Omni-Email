import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDailySummary } from "@/lib/ai/daily-summary";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let date: string | undefined;
  try {
    const body = (await request.json()) as { date?: string };
    const d = body.date?.trim();
    if (d) {
      // Validate YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) {
        return NextResponse.json(
          { error: "date must be in YYYY-MM-DD format" },
          { status: 400 },
        );
      }
      date = d;
    }
  } catch {
    // Empty body is fine — default to today
  }

  try {
    const summary = await generateDailySummary(user.id, date);
    return NextResponse.json({ summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Summary generation failed";
    if (msg.includes("rate limit")) {
      return NextResponse.json({ error: msg }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
