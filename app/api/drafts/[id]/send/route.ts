import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReply } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch draft and verify ownership
  const { data: draft, error: dErr } = await supabase
    .from("drafts")
    .select(
      "id, account_id, thread_id, body_text, body_html, status, source, tone",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (dErr || !draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if ((draft.status as string) !== "draft") {
    return NextResponse.json(
      { error: "Draft has already been sent or discarded" },
      { status: 409 },
    );
  }

  const bodyText = (draft.body_text as string | null) ?? "";
  const bodyHtml = (draft.body_html as string | null) ?? null;

  if (!bodyText.trim() && !bodyHtml?.trim()) {
    return NextResponse.json(
      { error: "Draft body is empty — add content before sending" },
      { status: 400 },
    );
  }

  const threadId = draft.thread_id as string;
  const accountId = draft.account_id as string;

  try {
    await sendReply({
      threadId,
      userId: user.id,
      bodyText,
      bodyHtml,
      accountId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Mark draft as sent
  const admin = createAdminClient();
  await admin
    .from("drafts")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", id);

  // Audit log (non-fatal)
  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "draft.send",
    targetType: "draft",
    targetId: id,
    details: {
      draftId: id,
      threadId,
      accountId,
      source: draft.source,
      tone: draft.tone,
    },
    reversible: false,
  }).catch(() => undefined);

  return NextResponse.json({ success: true });
}
