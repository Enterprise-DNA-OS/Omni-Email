import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let text = "";
  let instruction = "";
  try {
    const body = (await request.json()) as { text?: string; instruction?: string };
    text = body.text?.trim() ?? "";
    instruction = body.instruction?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-improve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ text, instruction }),
    });

    if (efRes.status === 429) {
      return NextResponse.json(
        { error: "AI rate limit reached — please try again shortly" },
        { status: 429 },
      );
    }
    if (!efRes.ok) {
      const text = await efRes.text();
      return NextResponse.json(
        { error: `AI service error (${efRes.status}): ${text}` },
        { status: 500 },
      );
    }

    const { improved } = (await efRes.json()) as { improved: string };
    return NextResponse.json({ improved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
