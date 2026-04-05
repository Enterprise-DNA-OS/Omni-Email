import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeApprovedAction, ApprovalQueueEntry } from "@/lib/approval/queue";
import { logAuditEvent } from "@/lib/audit/log";

export async function PATCH(
  request: Request,
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
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let action: "approve" | "reject";
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }
    action = body.action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the entry and verify ownership
  const { data: entry, error: fetchErr } = await admin
    .from("approval_queue")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if ((entry.status as string) !== "pending") {
    return NextResponse.json(
      { error: `Entry is already ${entry.status as string}` },
      { status: 409 },
    );
  }

  const resolvedAt = new Date().toISOString();
  const newStatus = action === "approve" ? "approved" : "rejected";

  if (action === "approve") {
    try {
      await executeApprovedAction(entry as ApprovalQueueEntry);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Update the queue entry status
  const { error: updateErr } = await admin
    .from("approval_queue")
    .update({ status: newStatus, resolved_at: resolvedAt })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Log the human decision
  await logAuditEvent({
    userId: user.id,
    actor: "user",
    action: `approval_queue.${newStatus}`,
    targetType: "approval_queue",
    targetId: id,
    details: {
      thread_id: entry.thread_id as string,
      proposed_action: entry.proposed_action as string,
      confidence: entry.confidence as number,
    },
    reversible: false,
  });

  return NextResponse.json({ success: true, status: newStatus });
}
