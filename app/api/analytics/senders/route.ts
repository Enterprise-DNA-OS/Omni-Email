/**
 * GET /api/analytics/senders
 *
 * Returns top senders and recipients with message counts for the
 * authenticated user within a given time period.
 *
 * Query params:
 *   ?period=7d|30d|90d   (default: 30d)
 *   ?limit=20            (default: 20, max: 50)
 *
 * Response:
 * {
 *   senders: [{ email, name, domain, count, lastSeen }],
 *   recipients: [{ email, name, count }]
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PeriodKey = "7d" | "30d" | "90d";

const VALID_PERIODS: PeriodKey[] = ["7d", "30d", "90d"];

function periodToDays(period: PeriodKey): number {
  return period === "7d" ? 7 : period === "30d" ? 30 : 90;
}

function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : raw.toLowerCase().trim();
}

function extractName(raw: string): string {
  const match = raw.match(/^([^<]+)<[^>]+>/);
  if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  return raw.trim();
}

function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1] : email;
}

interface SenderEntry {
  email: string;
  name: string;
  domain: string;
  count: number;
  lastSeen: string;
}

interface RecipientEntry {
  email: string;
  name: string;
  count: number;
}

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
  const rawPeriod = url.searchParams.get("period") ?? "30d";
  const period: PeriodKey = VALID_PERIODS.includes(rawPeriod as PeriodKey)
    ? (rawPeriod as PeriodKey)
    : "30d";

  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 20 : rawLimit), 50);

  const days = periodToDays(period);
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const admin = createAdminClient();

    // Get user's own email addresses to exclude from senders
    const { data: accountRows } = await admin
      .from("accounts")
      .select("email_address, id")
      .eq("user_id", user.id);

    const userEmails = new Set(
      (accountRows ?? []).map((a) => (a.email_address as string).toLowerCase()),
    );
    const userAccountIds = new Set((accountRows ?? []).map((a) => a.id as string));

    // Get threads for the user
    const { data: threadRows } = await admin
      .from("threads")
      .select("id")
      .eq("user_id", user.id);

    const threadIds = (threadRows ?? []).map((t) => t.id as string);

    if (threadIds.length === 0) {
      return NextResponse.json({ senders: [], recipients: [] });
    }

    // Fetch messages in range with sender + recipients + account_id
    const { data: msgs, error: msgErr } = await admin
      .from("messages")
      .select("sender, recipients, account_id, message_at")
      .in("thread_id", threadIds)
      .gte("message_at", since.toISOString());

    if (msgErr) throw new Error(msgErr.message);

    // Tally senders (inbound only — messages not from user accounts)
    const senderMap = new Map<
      string,
      { name: string; count: number; lastSeen: string }
    >();

    // Tally recipients (outbound only — messages from user accounts)
    const recipientMap = new Map<string, { name: string; count: number }>();

    for (const msg of msgs ?? []) {
      const isOutbound = userAccountIds.has(msg.account_id as string);
      const senderRaw = (msg.sender ?? "") as string;
      const msgAt = msg.message_at as string;

      if (!isOutbound && senderRaw) {
        const email = extractEmail(senderRaw);
        if (!userEmails.has(email)) {
          const name = extractName(senderRaw);
          const existing = senderMap.get(email);
          if (!existing) {
            senderMap.set(email, { name, count: 1, lastSeen: msgAt });
          } else {
            existing.count++;
            if (msgAt > existing.lastSeen) existing.lastSeen = msgAt;
          }
        }
      }

      if (isOutbound) {
        const recipientsRaw = (msg.recipients ?? []) as Array<
          string | { email?: string; name?: string }
        >;
        for (const r of recipientsRaw) {
          let email = "";
          let name = "";
          if (typeof r === "string") {
            email = extractEmail(r);
            name = extractName(r);
          } else if (r && typeof r === "object") {
            email = (r.email ?? "").toLowerCase().trim();
            name = r.name ?? "";
          }
          if (!email || userEmails.has(email)) continue;
          const existing = recipientMap.get(email);
          if (!existing) {
            recipientMap.set(email, { name, count: 1 });
          } else {
            existing.count++;
          }
        }
      }
    }

    // Convert to sorted arrays
    const senders: SenderEntry[] = Array.from(senderMap.entries())
      .map(([email, v]) => ({
        email,
        name: v.name || email,
        domain: extractDomain(email),
        count: v.count,
        lastSeen: v.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const recipients: RecipientEntry[] = Array.from(recipientMap.entries())
      .map(([email, v]) => ({
        email,
        name: v.name || email,
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return NextResponse.json({ senders, recipients });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
