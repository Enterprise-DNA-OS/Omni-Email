import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeApprovedAction, ApprovalQueueEntry } from "@/lib/approval/queue";
import { logAuditEvent } from "@/lib/audit/log";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ids: string[];
  let action: "approve" | "reject";
  try {
    const body = (await request.json()) as { ids?: unknown; action?: string };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }
    ids = (body.ids as unknown[]).map(String);
    action = body.action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Guard: cap batch size to prevent abuse
  if (ids.length > 100) {
    return NextResponse.json({ error: "Batch size cannot exceed 100" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch all requested entries in one query, scoped to the authenticated user
  const { data: entries, error: fetchErr } = await admin
    .from("approval_queue")
    .select("*")
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const resolvedAt = new Date().toISOString();
  const newStatus = action === "approve" ? "approved" : "rejected";
  let processed = 0;
  const errors: string[] = [];

  for (const entry of entries ?? []) {
    try {
      if (action === "approve") {
        await executeApprovedAction(entry as ApprovalQueueEntry);
      }

      await admin
        .from("approval_queue")
        .update({ status: newStatus, resolved_at: resolvedAt })
        .eq("id", entry.id as string);

      await logAuditEvent({
        userId: user.id,
        actor: "user",
        action: `approval_queue.batch.${newStatus}`,
        targetType: "approval_queue",
        targetId: entry.id as string,
        details: {
          thread_id: entry.thread_id as string,
          proposed_action: entry.proposed_action as string,
          confidence: entry.confidence as number,
        },
        reversible: false,
      });

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${entry.id as string}: ${message}`);
    }
  }

  return NextResponse.json({ processed, errors });
}
