import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteThreadRemote } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import { recordSignal } from "@/lib/ai/behavioral-learning";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: thread, error: te } = await supabase
    .from("threads")
    .select("id, subject, snippet, last_message_at, primary_account_id, archived_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (te || !thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages, error: me } = await supabase
    .from("messages")
    .select(
      "id, sender, recipients, body_html, body_text, message_at, in_reply_to, is_read, account_id",
    )
    .eq("thread_id", id)
    .order("message_at", { ascending: true });

  if (me) {
    return NextResponse.json({ error: me.message }, { status: 500 });
  }

  let account: { provider: string; emailAddress: string } | null = null;
  if (thread.primary_account_id) {
    const { data: acc } = await supabase
      .from("accounts")
      .select("provider, email_address")
      .eq("id", thread.primary_account_id)
      .maybeSingle();
    if (acc) {
      account = { provider: acc.provider as string, emailAddress: acc.email_address as string };
    }
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      snippet: thread.snippet,
      lastMessageAt: thread.last_message_at,
      primaryAccountId: thread.primary_account_id,
      archivedAt: thread.archived_at,
      account,
    },
    messages: messages ?? [],
  });
}

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

  // Soft-delete the thread first so it hides immediately from the inbox,
  // even if the remote provider delete fails. Keep thread_sources so the
  // sync guard (deleted_at check) can prevent resurrection on next sync.
  const now = new Date();
  const hardDeleteAfter = new Date(now);
  hardDeleteAfter.setDate(hardDeleteAfter.getDate() + 30);
  await admin
    .from("threads")
    .update({
      deleted_at: now.toISOString(),
      hard_delete_after: hardDeleteAfter.toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  // Attempt remote delete — non-fatal
  try {
    await deleteThreadRemote({ threadId: id, userId: user.id });
  } catch (e) {
    console.warn(
      `Remote delete failed for thread ${id}: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }

  // Write the audit log entry and return its id so the caller can offer undo
  let auditLogId: string | null = null;
  try {
    const entry = await logAuditEvent({
      userId: user.id,
      actor: "user",
      action: "thread.delete",
      targetType: "thread",
      targetId: id,
      details: {},
      reversible: true,
    });
    auditLogId = entry.id;
  } catch {
    // Audit failure must not block the response
  }

  void recordSignal(user.id, id, "deleted").catch(() => undefined);

  return NextResponse.json({ ok: true, auditLogId });
}
