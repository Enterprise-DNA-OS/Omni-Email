import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deactivateRunInboxMode } from "@/lib/ai/run-inbox";

// POST /api/run-inbox/deactivate
// No body required.
export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await deactivateRunInboxMode(user.id);
    return NextResponse.json({ success: true, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to deactivate Run My Inbox mode";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
