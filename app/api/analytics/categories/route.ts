/**
 * GET /api/analytics/categories
 *
 * Returns email category distribution from AI-classified threads.
 *
 * Query params:
 *   ?period=7d|30d|90d   (default: 30d)
 *
 * Response:
 * {
 *   categories: [{ name, count, pct }]
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

interface CategoryEntry {
  name: string;
  count: number;
  pct: number;
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

    // Fetch threads with an AI category in the period
    const { data: rows, error } = await admin
      .from("threads")
      .select("ai_category")
      .eq("user_id", user.id)
      .gte("last_message_at", since.toISOString())
      .not("ai_category", "is", null);

    if (error) throw new Error(error.message);

    // Tally counts per category
    const countMap = new Map<string, number>();
    for (const row of rows ?? []) {
      const cat = ((row.ai_category as string) ?? "").trim() || "Uncategorized";
      countMap.set(cat, (countMap.get(cat) ?? 0) + 1);
    }

    const total = Array.from(countMap.values()).reduce((s, c) => s + c, 0);

    const categories: CategoryEntry[] = Array.from(countMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
