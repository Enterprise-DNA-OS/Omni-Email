import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDigest } from "@/lib/ai/digest-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entryId = await generateDigest(id, user.id);
    return NextResponse.json({ success: true, entryId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Digest generation failed";
    if (msg.includes("rate limit")) {
      return NextResponse.json({ error: msg }, { status: 429 });
    }
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
