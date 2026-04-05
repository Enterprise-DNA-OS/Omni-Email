import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activateRunInboxMode } from "@/lib/ai/run-inbox";

// POST /api/run-inbox/activate
// Body: { until?: string (ISO timestamp), emergencySenders?: string[] }
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let until: string | null = null;
  let emergencySenders: string[] = [];

  try {
    const body = (await request.json()) as {
      until?: string;
      emergencySenders?: string[];
    };

    if (body.until) {
      const parsed = new Date(body.until);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "until must be a valid ISO timestamp" },
          { status: 400 },
        );
      }
      if (parsed <= new Date()) {
        return NextResponse.json(
          { error: "until must be in the future" },
          { status: 400 },
        );
      }
      until = parsed.toISOString();
    }

    if (Array.isArray(body.emergencySenders)) {
      emergencySenders = body.emergencySenders
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 50); // guard against excessively large lists
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await activateRunInboxMode(user.id, until, emergencySenders);
    return NextResponse.json({ success: true, until, emergencySenders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to activate Run My Inbox mode";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
