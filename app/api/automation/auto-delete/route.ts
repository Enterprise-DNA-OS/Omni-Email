import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processAutoDelete, purgeHardDeleteDue } from "@/lib/automation/auto-delete";

/**
 * POST /api/automation/auto-delete
 *
 * Manually trigger auto-delete processing for the authenticated user, followed
 * by a hard-delete purge pass for expired soft-deleted threads.
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
    const deleteResult = await processAutoDelete(user.id);
    const purgeResult = await purgeHardDeleteDue();
    return NextResponse.json({ ok: true, ...deleteResult, purged: purgeResult.purged });
  } catch (err) {
    console.error("auto-delete route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
