import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * POST /api/threads/empty-trash
 *
 * Hard-deletes all threads that have been soft-deleted (deleted_at IS NOT NULL)
 * for the authenticated user. Deletes in FK dependency order:
 *   thread_sources → messages → threads
 *
 * Returns { success: true, purged: number }
 */
export async function POST(_request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find all soft-deleted threads for this user
  const { data: deletedThreads, error: fetchErr } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", user.id)
    .not("deleted_at", "is", null);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const deletedIds = (deletedThreads ?? []).map((t) => t.id as string);

  if (deletedIds.length === 0) {
    return NextResponse.json({ success: true, purged: 0 });
  }

  // Delete in FK dependency order: thread_sources first, then messages, then threads
  const { error: srcErr } = await admin
    .from("thread_sources")
    .delete()
    .in("thread_id", deletedIds);

  if (srcErr) {
    return NextResponse.json(
      { error: `Failed to delete thread_sources: ${srcErr.message}` },
      { status: 500 },
    );
  }

  const { error: msgErr } = await admin
    .from("messages")
    .delete()
    .in("thread_id", deletedIds);

  if (msgErr) {
    return NextResponse.json(
      { error: `Failed to delete messages: ${msgErr.message}` },
      { status: 500 },
    );
  }

  const { error: threadErr } = await admin
    .from("threads")
    .delete()
    .in("id", deletedIds)
    .eq("user_id", user.id);

  if (threadErr) {
    return NextResponse.json(
      { error: `Failed to delete threads: ${threadErr.message}` },
      { status: 500 },
    );
  }

  // Log the operation as a single audit entry
  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "trash.empty",
    targetType: "threads",
    targetId: undefined,
    details: { purged: deletedIds.length },
    reversible: false,
  }).catch(() => undefined);

  return NextResponse.json({ success: true, purged: deletedIds.length });
}
