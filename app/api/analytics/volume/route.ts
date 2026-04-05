/**
 * GET /api/analytics/volume
 *
 * Returns daily email volume broken down by received, sent, archived,
 * and auto-handled (auto-archived + auto-deleted) counts.
 *
 * Query params:
 *   ?period=7d|14d|30d|90d   (default: 30d)
 *
 * Response:
 * {
 *   days: [{ date, received, sent, archived, autoHandled }]
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PeriodKey = "7d" | "14d" | "30d" | "90d";

const VALID_PERIODS: PeriodKey[] = ["7d", "14d", "30d", "90d"];

function periodToDays(period: PeriodKey): number {
  const map: Record<PeriodKey, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };
  return map[period];
}

function buildDateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

interface VolumeDay {
  date: string;
  received: number;
  sent: number;
  archived: number;
  autoHandled: number;
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
  const dateRange = buildDateRange(days);
  const sinceDate = dateRange[0];

  try {
    const admin = createAdminClient();

    // Pull from analytics_daily for received/sent/auto_archived/auto_deleted
    const { data: dailyRows, error: dailyErr } = await admin
      .from("analytics_daily")
      .select(
        "date, emails_received, emails_sent, emails_auto_archived, emails_auto_deleted",
      )
      .eq("user_id", user.id)
      .gte("date", sinceDate)
      .order("date", { ascending: true });

    if (dailyErr) throw new Error(dailyErr.message);

    // For archived counts, query audit_log for archive actions (manual + auto)
    const AUTO_ARCHIVE_ACTIONS = ["archive", "auto_archive", "thread.archive"];
    const { data: auditRows, error: auditErr } = await admin
      .from("audit_log")
      .select("created_at, action")
      .eq("user_id", user.id)
      .in("action", AUTO_ARCHIVE_ACTIONS)
      .gte("created_at", `${sinceDate}T00:00:00.000Z`);

    if (auditErr) throw new Error(auditErr.message);

    // Tally archive actions per day
    const archiveByDay = new Map<string, number>();
    for (const row of auditRows ?? []) {
      const d = (row.created_at as string).slice(0, 10);
      archiveByDay.set(d, (archiveByDay.get(d) ?? 0) + 1);
    }

    // Build a map from analytics_daily for fast lookup
    const dailyMap = new Map<
      string,
      {
        emails_received: number;
        emails_sent: number;
        emails_auto_archived: number;
        emails_auto_deleted: number;
      }
    >();
    for (const row of dailyRows ?? []) {
      dailyMap.set(row.date as string, {
        emails_received: (row.emails_received as number) ?? 0,
        emails_sent: (row.emails_sent as number) ?? 0,
        emails_auto_archived: (row.emails_auto_archived as number) ?? 0,
        emails_auto_deleted: (row.emails_auto_deleted as number) ?? 0,
      });
    }

    const result: VolumeDay[] = dateRange.map((date) => {
      const row = dailyMap.get(date);
      return {
        date,
        received: row?.emails_received ?? 0,
        sent: row?.emails_sent ?? 0,
        archived: archiveByDay.get(date) ?? 0,
        autoHandled: (row?.emails_auto_archived ?? 0) + (row?.emails_auto_deleted ?? 0),
      };
    });

    return NextResponse.json({ days: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
