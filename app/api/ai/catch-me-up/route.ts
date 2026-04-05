import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCatchMeUp } from "@/lib/ai/catch-me-up";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let since: string | undefined;
  try {
    const body = (await request.json()) as { since?: string };
    if (body.since && typeof body.since === "string") {
      // Validate it parses as a date
      const d = new Date(body.since);
      if (!isNaN(d.getTime())) {
        since = body.since;
      }
    }
  } catch {
    // Empty body is valid — use defaults
  }

  try {
    const briefing = await generateCatchMeUp(user.id, since);
    return NextResponse.json(briefing);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    if (msg.includes("rate limit")) {
      return NextResponse.json({ error: msg }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
