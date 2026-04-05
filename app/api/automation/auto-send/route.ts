import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processAutoSend } from "@/lib/automation/auto-send";

/**
 * POST /api/automation/auto-send
 *
 * Manually trigger auto-send processing for the authenticated user.
 */
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
    const result = await processAutoSend(user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("auto-send route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
