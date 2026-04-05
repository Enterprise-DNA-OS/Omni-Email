/**
 * GET /api/analytics/heatmap
 *
 * Returns message volume by hour (0–23) and day-of-week (0=Sun … 6=Sat)
 * for the past N days, suitable for rendering a 7×24 activity heatmap.
 *
 * Query params:
 *   ?days=90    (default: 90, max: 365)
 *
 * Response shape:
 * {
 *   cells: [
 *     { hour: 0, dayOfWeek: 0, count: 12 },
 *     ...  // 168 entries (7 days × 24 hours)
 *   ],
 *   days: 90
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeVolumeHeatmap } from "@/lib/analytics/aggregate";

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
  const rawDays = parseInt(url.searchParams.get("days") ?? "90", 10);
  const days = Math.min(Math.max(1, isNaN(rawDays) ? 90 : rawDays), 365);

  try {
    const cells = await computeVolumeHeatmap(user.id, days);
    return NextResponse.json({ cells, days });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
