/**
 * GET /api/analytics/response-times
 *
 * Returns detailed response time analytics: avg, median, p95, trend by day,
 * and top slowest-response senders.
 *
 * Query params:
 *   ?period=7d|30d|90d   (default: 30d)
 *
 * Response:
 * {
 *   avgMinutes: number,
 *   medianMinutes: number,
 *   p95Minutes: number,
 *   byDay: [{ date, avgMinutes }],
 *   bySender: [{ email, avgMinutes, count }]   -- top 5 slowest
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : raw.toLowerCase().trim();
}

interface ResponsePair {
  inboundSender: string;
  responseMinutes: number;
  date: string; // YYYY-MM-DD of the response
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

  const days = periodToDays(period);
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const admin = createAdminClient();

    const { data: accountRows } = await admin
      .from("accounts")
      .select("id, email_address")
      .eq("user_id", user.id);

    const userAccountIds = new Set((accountRows ?? []).map((a) => a.id as string));
    const userEmails = new Set(
      (accountRows ?? []).map((a) => (a.email_address as string).toLowerCase()),
    );

    const { data: threadRows } = await admin
      .from("threads")
      .select("id")
      .eq("user_id", user.id);

    const threadIds = (threadRows ?? []).map((t) => t.id as string);

    if (threadIds.length === 0) {
      return NextResponse.json({
        avgMinutes: 0,
        medianMinutes: 0,
        p95Minutes: 0,
        byDay: [],
        bySender: [],
      });
    }

    const { data: msgs, error: msgErr } = await admin
      .from("messages")
      .select("account_id, sender, message_at, thread_id")
      .in("thread_id", threadIds)
      .gte("message_at", since.toISOString())
      .order("message_at", { ascending: true });

    if (msgErr) throw new Error(msgErr.message);

    // Group messages by thread, then compute response pairs
    const threadMessages = new Map<
      string,
      Array<{ isOutbound: boolean; senderRaw: string; at: Date }>
    >();

    for (const msg of msgs ?? []) {
      const isOutbound = userAccountIds.has(msg.account_id as string);
      const senderEmail = extractEmail((msg.sender ?? "") as string);
      // Skip messages where the sender is the user (outbound or self-sent)
      if (!isOutbound && userEmails.has(senderEmail)) continue;

      const entry = {
        isOutbound,
        senderRaw: (msg.sender ?? "") as string,
        at: new Date(msg.message_at as string),
      };
      const tid = msg.thread_id as string;
      if (!threadMessages.has(tid)) threadMessages.set(tid, []);
      threadMessages.get(tid)!.push(entry);
    }

    const pairs: ResponsePair[] = [];

    for (const [, messages] of threadMessages) {
      // Already sorted ascending by message_at from DB
      let lastInboundSender: string | null = null;
      let lastInboundAt: Date | null = null;

      for (const msg of messages) {
        if (!msg.isOutbound) {
          lastInboundSender = msg.senderRaw;
          lastInboundAt = msg.at;
        } else if (lastInboundAt) {
          const responseMinutes = (msg.at.getTime() - lastInboundAt.getTime()) / (1000 * 60);
          if (responseMinutes > 0) {
            pairs.push({
              inboundSender: lastInboundSender ?? "",
              responseMinutes,
              date: msg.at.toISOString().slice(0, 10),
            });
          }
          // Reset — only count one response per inbound
          lastInboundAt = null;
          lastInboundSender = null;
        }
      }
    }

    if (pairs.length === 0) {
      return NextResponse.json({
        avgMinutes: 0,
        medianMinutes: 0,
        p95Minutes: 0,
        byDay: [],
        bySender: [],
      });
    }

    const allMinutes = pairs.map((p) => p.responseMinutes).sort((a, b) => a - b);
    const avgMinutes = parseFloat(
      (allMinutes.reduce((s, v) => s + v, 0) / allMinutes.length).toFixed(1),
    );
    const medianMinutes = parseFloat(percentile(allMinutes, 50).toFixed(1));
    const p95Minutes = parseFloat(percentile(allMinutes, 95).toFixed(1));

    // By day
    const dayMap = new Map<string, number[]>();
    for (const p of pairs) {
      if (!dayMap.has(p.date)) dayMap.set(p.date, []);
      dayMap.get(p.date)!.push(p.responseMinutes);
    }
    const byDay = Array.from(dayMap.entries())
      .map(([date, mins]) => ({
        date,
        avgMinutes: parseFloat(
          (mins.reduce((s, v) => s + v, 0) / mins.length).toFixed(1),
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // By sender — top 5 slowest (minimum 2 responses)
    const senderMap = new Map<string, number[]>();
    for (const p of pairs) {
      const email = extractEmail(p.inboundSender);
      if (!email) continue;
      if (!senderMap.has(email)) senderMap.set(email, []);
      senderMap.get(email)!.push(p.responseMinutes);
    }
    const bySender = Array.from(senderMap.entries())
      .filter(([, mins]) => mins.length >= 2)
      .map(([email, mins]) => ({
        email,
        avgMinutes: parseFloat(
          (mins.reduce((s, v) => s + v, 0) / mins.length).toFixed(1),
        ),
        count: mins.length,
      }))
      .sort((a, b) => b.avgMinutes - a.avgMinutes)
      .slice(0, 5);

    return NextResponse.json({ avgMinutes, medianMinutes, p95Minutes, byDay, bySender });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
