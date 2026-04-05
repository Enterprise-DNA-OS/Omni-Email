import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRunInboxStatus } from "@/lib/ai/run-inbox";

// GET /api/run-inbox/status
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getRunInboxStatus(user.id);
    return NextResponse.json(status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Run My Inbox status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
