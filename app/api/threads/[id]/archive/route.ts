import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveThreadRemote } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";
import { recordSignal } from "@/lib/ai/behavioral-learning";

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

  // Read ai_intent before archiving so we can record override feedback
  const { data: threadRow } = await supabase
    .from("threads")
    .select("ai_intent")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  const threadAiIntent = (threadRow as { ai_intent?: string | null } | null)?.ai_intent ?? null;

  try {
    await archiveThreadRemote({ threadId: id, userId: user.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "archive_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const admin = createAdminClient();
  await admin
    .from("threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  // Record implicit override feedback when the user archives a thread the AI did not recommend archiving
  if (threadAiIntent && threadAiIntent !== "archive") {
    void Promise.resolve(
      admin.from("ai_feedback").insert({
        user_id: user.id,
        thread_id: id,
        feedback_type: "action",
        ai_output: { intent: threadAiIntent },
        user_correction: { actual_action: "archive" },
      }),
    ).catch(() => undefined);
  }

  // Write the audit log entry and return its id so the caller can offer undo
  let auditLogId: string | null = null;
  try {
    const entry = await logAuditEvent({
      userId: user.id,
      actor: "user",
      action: "thread.archive",
      targetType: "thread",
      targetId: id,
      details: {},
      reversible: true,
    });
    auditLogId = entry.id;
  } catch {
    // Audit failure must not block the response
  }

  void recordSignal(user.id, id, "archived").catch(() => undefined);

  return NextResponse.json({ ok: true, auditLogId });
}
