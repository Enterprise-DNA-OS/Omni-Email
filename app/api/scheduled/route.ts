import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/scheduled
 * Lists the authenticated user's queued scheduled messages.
 * Supports pagination via ?offset= and filtering by ?accountId=.
 */
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
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const accountId = url.searchParams.get("accountId");
  const status = url.searchParams.get("status") ?? "queued";

  // Validate status param against allowed values
  const allowedStatuses = ["queued", "sent", "cancelled", "failed"] as const;
  type AllowedStatus = (typeof allowedStatuses)[number];
  if (!allowedStatuses.includes(status as AllowedStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}` },
      { status: 400 },
    );
  }

  let query = supabase
    .from("scheduled_messages")
    .select(
      "id, account_id, thread_id, to_recipients, cc, bcc, subject, body_html, body_text, send_at, status, error_message, created_at",
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("send_at", { ascending: true })
    .range(offset, offset + 24);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = (rows ?? []).map((r) => ({
    id: r.id,
    accountId: r.account_id,
    threadId: r.thread_id ?? null,
    toRecipients: r.to_recipients,
    cc: r.cc ?? [],
    bcc: r.bcc ?? [],
    subject: r.subject ?? null,
    bodyHtml: r.body_html ?? null,
    bodyText: r.body_text ?? null,
    sendAt: r.send_at,
    status: r.status,
    errorMessage: r.error_message ?? null,
    createdAt: r.created_at,
  }));

  return NextResponse.json({
    messages,
    nextOffset: offset + messages.length,
  });
}
