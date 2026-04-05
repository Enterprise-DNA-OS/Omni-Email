import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { recordSignal } from "@/lib/ai/behavioral-learning";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/threads/[id]/read — mark all messages as read
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

  const admin = createAdminClient();
  // Verify thread ownership
  const { data: thread } = await admin
    .from("threads")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await admin
    .from("messages")
    .update({ is_read: true })
    .eq("thread_id", id)
    .eq("is_read", false);

  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "thread.mark_read",
    targetType: "thread",
    targetId: id,
    details: {},
    reversible: false,
  }).catch(() => undefined);

  void recordSignal(user.id, id, "read").catch(() => undefined);

  return NextResponse.json({ ok: true });
}

// DELETE /api/threads/[id]/read — mark latest message as unread
export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("threads")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Mark only the most recent message as unread
  const { data: latest } = await admin
    .from("messages")
    .select("id")
    .eq("thread_id", id)
    .order("message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) {
    await admin.from("messages").update({ is_read: false }).eq("id", latest.id);
  }

  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "thread.mark_unread",
    targetType: "thread",
    targetId: id,
    details: {},
    reversible: false,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
