import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
type QueueStatus = (typeof VALID_STATUSES)[number];

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status") ?? "pending";
  const status: QueueStatus = VALID_STATUSES.includes(rawStatus as QueueStatus)
    ? (rawStatus as QueueStatus)
    : "pending";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);

  const admin = createAdminClient();

  // Fetch queue entries with a join to threads for subject/snippet/sender info
  const { data: rows, error, count } = await admin
    .from("approval_queue")
    .select(
      `
      id,
      thread_id,
      proposed_action,
      proposed_details,
      confidence,
      reasoning,
      status,
      resolved_at,
      expires_at,
      created_at,
      threads (
        subject,
        snippet,
        sender_name,
        sender_email
      )
    `,
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (rows ?? []).map((row) => {
    const threadRaw = row.threads as
      | { subject: string | null; snippet: string | null; sender_name: string | null; sender_email: string | null }
      | { subject: string | null; snippet: string | null; sender_name: string | null; sender_email: string | null }[]
      | null;
    const thread = Array.isArray(threadRaw) ? (threadRaw[0] ?? null) : threadRaw;

    return {
      id: row.id,
      threadId: row.thread_id,
      proposedAction: row.proposed_action,
      proposedDetails: row.proposed_details ?? {},
      confidence: row.confidence,
      reasoning: row.reasoning ?? null,
      status: row.status,
      resolvedAt: row.resolved_at ?? null,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      thread: thread
        ? {
            subject: thread.subject ?? "(no subject)",
            snippet: thread.snippet ?? null,
            senderName: thread.sender_name ?? null,
            senderEmail: thread.sender_email ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({
    items,
    total: count ?? 0,
    limit,
    offset,
    nextOffset: offset + items.length,
  });
}
