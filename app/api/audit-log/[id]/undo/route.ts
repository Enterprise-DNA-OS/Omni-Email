import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AuditLogEntry } from "@/lib/audit/log";
import { executeUndo } from "@/lib/undo/execute";

type Ctx = { params: Promise<{ id: string }> };

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

  // Fetch the full entry — RLS ensures it belongs to the authenticated user
  const { data: entry, error: fetchErr } = await supabase
    .from("audit_log")
    .select("id, user_id, actor, action, target_type, target_id, details, reversible, undone_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: "Audit log entry not found" }, { status: 404 });
  }

  if (!entry.reversible) {
    return NextResponse.json({ error: "This action is not reversible" }, { status: 400 });
  }

  if (entry.undone_at) {
    return NextResponse.json({ error: "Action has already been undone" }, { status: 409 });
  }

  try {
    await executeUndo(entry as AuditLogEntry);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "undo_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
