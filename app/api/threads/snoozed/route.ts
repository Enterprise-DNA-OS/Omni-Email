import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/threads/snoozed
 * Returns all threads that are currently snoozed (snoozed_until IS NOT NULL AND snoozed_until > now).
 * Supports optional ?accountId= filter and pagination via ?offset=.
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

  const now = new Date().toISOString();

  let query = supabase
    .from("threads")
    .select(
      "id, subject, snippet, last_message_at, primary_account_id, sender_name, sender_email, snoozed_until",
    )
    .eq("user_id", user.id)
    .not("snoozed_until", "is", null)
    .gt("snoozed_until", now)
    .order("snoozed_until", { ascending: true })
    .range(offset, offset + 24);

  if (accountId) {
    query = query.eq("primary_account_id", accountId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threads = (rows ?? []).map((r) => ({
    id: r.id,
    subject: r.subject,
    snippet: r.snippet,
    lastMessageAt: r.last_message_at,
    primaryAccountId: r.primary_account_id,
    senderName: r.sender_name ?? null,
    senderEmail: r.sender_email ?? null,
    snoozedUntil: r.snoozed_until,
  }));

  return NextResponse.json({
    threads,
    nextOffset: offset + threads.length,
  });
}
