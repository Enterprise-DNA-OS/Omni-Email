import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeUnsubscribe } from "@/lib/email/unsubscribe";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/threads/:id/unsubscribe
 *
 * Triggers auto-unsubscribe for the thread's sender using the stored
 * List-Unsubscribe header. Returns the unsubscribe method, final status,
 * and the ID of the unsubscribe_log row created.
 */
export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await executeUnsubscribe(user.id, id);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unsubscribe_failed";
    // 422 for missing/unusable header, 502 for provider send errors
    const status = message.includes("no List-Unsubscribe") ? 422 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
