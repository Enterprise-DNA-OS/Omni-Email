/**
 * GET /api/analytics/dashboard
 *
 * Returns aggregated inbox health metrics for the authenticated user.
 *
 * Query params:
 *   ?range=7d|30d|90d    (default: 7d)
 *
 * If the requested range lacks pre-aggregated rows, this endpoint triggers
 * aggregation for any missing dates before returning results.
 *
 * Response shape:
 * {
 *   range: "7d",
 *   volumeTrends: [{ date, received, sent }],
 *   automationRate: 0.12,
 *   avgResponseTimeTrendMinutes: [{ date, avg }],
 *   draftAcceptanceRate: 0.75,
 *   busiestHours: [{ hour, count }],  // 24 entries
 *   totalReceived: 142,
 *   totalSent: 38,
 *   totalAutoArchived: 20,
 *   totalAutoDeleted: 5,
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateDailyAnalytics, computeInboxHealth } from "@/lib/analytics/aggregate";

type RangeKey = "7d" | "30d" | "90d";

const VALID_RANGES: RangeKey[] = ["7d", "30d", "90d"];

function rangeTodays(range: RangeKey): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

/** Return ISO date strings for the past N days (today inclusive), UTC. */
function buildDateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
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
  const rawRange = url.searchParams.get("range") ?? "7d";
  const range: RangeKey = VALID_RANGES.includes(rawRange as RangeKey)
    ? (rawRange as RangeKey)
    : "7d";

  try {
    // Check which dates in the requested range already have aggregated rows.
    // For any missing dates, run aggregation now (best-effort, non-blocking failure).
    const days = rangeTodays(range);
    const expectedDates = buildDateRange(days);
    const sinceDate = expectedDates[0];

    const { data: existingRows } = await supabase
      .from("analytics_daily")
      .select("date")
      .eq("user_id", user.id)
      .gte("date", sinceDate);

    const existingDates = new Set((existingRows ?? []).map((r) => r.date as string));
    const missingDates = expectedDates.filter((d) => !existingDates.has(d));

    // Aggregate missing dates sequentially (typically only a few)
    for (const date of missingDates) {
      try {
        await aggregateDailyAnalytics(user.id, date);
      } catch {
        // Non-fatal: the dashboard will show zeros for this date
      }
    }

    // Now fetch the health summary
    const health = await computeInboxHealth(user.id, range);

    return NextResponse.json({ range, ...health });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
