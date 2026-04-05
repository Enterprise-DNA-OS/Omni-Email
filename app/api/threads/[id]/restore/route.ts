import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/threads/[id]/restore
 *
 * Undo a soft-delete: clears deleted_at and hard_delete_after so the thread
 * reappears in the inbox. Only the thread owner may restore.
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

  // Verify the thread exists, is owned by the user, and is currently soft-deleted
  const { data: thread, error: fetchErr } = await supabase
    .from("threads")
    .select("id, deleted_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  if (!(thread as { deleted_at: string | null }).deleted_at) {
    return NextResponse.json({ error: "Thread is not deleted" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("threads")
    .update({ deleted_at: null, hard_delete_after: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  try {
    await logAuditEvent({
      userId: user.id,
      actor: "user",
      action: "thread.restore",
      targetType: "thread",
      targetId: id,
      details: {},
      reversible: false,
    });
  } catch {
    // Audit failure must not block the response
  }

  return NextResponse.json({ ok: true });
}
