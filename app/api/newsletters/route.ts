import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type UnsubscribeStatus =
  | "subscribed"
  | "unsubscribed"
  | "pending"
  | "failed";

export interface NewsletterItem {
  senderEmail: string;
  senderName: string | null;
  domain: string | null;
  messageCount: number;
  lastReceived: string;
  unsubscribeStatus: UnsubscribeStatus;
  unsubscribeUrl: string | null;
  hasListUnsubscribe: boolean;
}

interface NewsletterRow {
  sender_email: string;
  sender_name: string | null;
  message_count: number;
  last_received: string;
  list_unsubscribe: string | null;
}

interface UnsubscribeLogRow {
  sender_email: string | null;
  status: string;
}

/**
 * GET /api/newsletters
 *
 * Returns all newsletter/subscription senders detected in the user's inbox.
 * Threads marked as newsletters or that have a List-Unsubscribe header are included.
 * Joined with unsubscribe_log to reflect the current unsubscribe status.
 *
 * Query params:
 *   status: "all" | "subscribed" | "unsubscribed"  (default: "all")
 *   sort:   "count" | "recent"                      (default: "recent")
 *   search: string                                  (optional)
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

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "recent";
  const search = searchParams.get("search") ?? "";

  // Aggregate newsletter threads by sender_email
  const { data: rows, error: rowsErr } = await supabase
    .from("threads")
    .select(
      "sender_email, sender_name, list_unsubscribe, last_message_at",
    )
    .eq("user_id", user.id)
    .or("is_newsletter.eq.true,list_unsubscribe.not.is.null")
    .not("sender_email", "is", null)
    .order("last_message_at", { ascending: false });

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  // Aggregate per sender_email in JS
  const senderMap = new Map<string, NewsletterRow>();
  for (const row of rows ?? []) {
    const email = (row.sender_email as string).toLowerCase();
    if (!senderMap.has(email)) {
      senderMap.set(email, {
        sender_email: email,
        sender_name: row.sender_name as string | null,
        message_count: 1,
        last_received: row.last_message_at as string,
        list_unsubscribe: row.list_unsubscribe as string | null,
      });
    } else {
      const existing = senderMap.get(email)!;
      existing.message_count += 1;
      // Keep the most recent unsubscribe header (non-null preferred)
      if (!existing.list_unsubscribe && row.list_unsubscribe) {
        existing.list_unsubscribe = row.list_unsubscribe as string;
      }
    }
  }

  // Load unsubscribe_log for this user — get latest status per sender_email
  const { data: logRows, error: logErr } = await supabase
    .from("unsubscribe_log")
    .select("sender_email, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  // Build a latest-status map (first entry per sender wins because ordered desc)
  const logMap = new Map<string, string>();
  for (const log of (logRows ?? []) as UnsubscribeLogRow[]) {
    if (log.sender_email && !logMap.has(log.sender_email.toLowerCase())) {
      logMap.set(log.sender_email.toLowerCase(), log.status);
    }
  }

  // Helper: extract the first HTTPS URL from a List-Unsubscribe header value
  function extractUnsubscribeUrl(header: string | null): string | null {
    if (!header) return null;
    // Strip any appended List-Unsubscribe-Post line
    const clean = header.split("\nList-Unsubscribe-Post:")[0];
    const matches = clean.match(/<([^>]+)>/g);
    if (!matches) return null;
    const urls = matches
      .map((m) => m.slice(1, -1).trim())
      .filter(
        (u) =>
          u.startsWith("https://") ||
          u.startsWith("http://") ||
          u.startsWith("mailto:"),
      );
    return urls[0] ?? null;
  }

  function extractDomain(email: string): string | null {
    const match = email.match(/@([\w.-]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  function mapStatus(logStatus: string | undefined): UnsubscribeStatus {
    if (!logStatus) return "subscribed";
    if (logStatus === "confirmed" || logStatus === "sent") return "unsubscribed";
    if (logStatus === "pending") return "pending";
    if (logStatus === "failed") return "failed";
    return "subscribed";
  }

  // Build final list
  let newsletters: NewsletterItem[] = Array.from(senderMap.values()).map(
    (row) => ({
      senderEmail: row.sender_email,
      senderName: row.sender_name,
      domain: extractDomain(row.sender_email),
      messageCount: row.message_count,
      lastReceived: row.last_received,
      unsubscribeStatus: mapStatus(logMap.get(row.sender_email)),
      unsubscribeUrl: extractUnsubscribeUrl(row.list_unsubscribe),
      hasListUnsubscribe: Boolean(row.list_unsubscribe),
    }),
  );

  // Apply search filter
  if (search) {
    const q = search.toLowerCase();
    newsletters = newsletters.filter(
      (n) =>
        n.senderEmail.includes(q) ||
        n.senderName?.toLowerCase().includes(q) ||
        n.domain?.includes(q),
    );
  }

  // Apply status filter
  if (statusFilter === "subscribed") {
    newsletters = newsletters.filter(
      (n) =>
        n.unsubscribeStatus === "subscribed" ||
        n.unsubscribeStatus === "failed",
    );
  } else if (statusFilter === "unsubscribed") {
    newsletters = newsletters.filter(
      (n) =>
        n.unsubscribeStatus === "unsubscribed" ||
        n.unsubscribeStatus === "pending",
    );
  }

  // Apply sort
  if (sort === "count") {
    newsletters.sort((a, b) => b.messageCount - a.messageCount);
  } else {
    newsletters.sort(
      (a, b) =>
        new Date(b.lastReceived).getTime() - new Date(a.lastReceived).getTime(),
    );
  }

  return NextResponse.json({ newsletters });
}
