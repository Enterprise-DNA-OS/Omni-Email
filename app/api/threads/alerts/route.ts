import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/threads/alerts
 *
 * Returns threads that have AI-detected risk or opportunity signals.
 *
 * Query parameters:
 *   ?type=risk|opportunity   — filter by signal type (default: both)
 *   ?severity=high|medium|low — filter by minimum severity (default: all)
 *   ?limit=N                  — max results (default: 50, max: 200)
 *
 * Returns:
 *   { threads: AlertThread[] }
 *
 * Where AlertThread is:
 *   { id, subject, snippet, lastMessageAt, aiSignals, aiCategory, aiPriority }
 */

type SignalType = "risk" | "opportunity";
type Severity = "high" | "medium" | "low";

interface AiSignal {
  type: SignalType;
  signal: string;
  severity: Severity;
}

interface AlertThread {
  id: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  aiSignals: AiSignal[];
  aiCategory: string | null;
  aiPriority: string | null;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const VALID_TYPES: SignalType[] = ["risk", "opportunity"];
const VALID_SEVERITIES: Severity[] = ["high", "medium", "low"];

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

  const typeParam = searchParams.get("type");
  const filterType: SignalType | null =
    typeParam && (VALID_TYPES as string[]).includes(typeParam)
      ? (typeParam as SignalType)
      : null;

  const severityParam = searchParams.get("severity");
  const filterSeverity: Severity | null =
    severityParam && (VALID_SEVERITIES as string[]).includes(severityParam)
      ? (severityParam as Severity)
      : null;

  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 200);

  // Fetch threads where ai_signals is a non-empty array
  // We fetch more than needed so we can filter client-side by type/severity
  const { data: rows, error } = await supabase
    .from("threads")
    .select("id, subject, snippet, last_message_at, ai_signals, ai_category, ai_priority")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .not("ai_signals", "eq", "[]")
    .not("ai_signals", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(limit * 4); // over-fetch to allow for client-side filtering

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threads: AlertThread[] = [];

  for (const row of rows ?? []) {
    const rawSignals = row.ai_signals as AiSignal[] | null;
    if (!Array.isArray(rawSignals) || rawSignals.length === 0) continue;

    // Filter signals by type and severity
    const filteredSignals = rawSignals.filter((s) => {
      if (!VALID_TYPES.includes(s.type) || !VALID_SEVERITIES.includes(s.severity)) return false;
      if (filterType && s.type !== filterType) return false;
      if (filterSeverity && SEVERITY_RANK[s.severity] < SEVERITY_RANK[filterSeverity]) return false;
      return true;
    });

    if (filteredSignals.length === 0) continue;

    threads.push({
      id: row.id as string,
      subject: (row.subject as string | null) ?? null,
      snippet: (row.snippet as string | null) ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? null,
      aiSignals: filteredSignals,
      aiCategory: (row.ai_category as string | null) ?? null,
      aiPriority: (row.ai_priority as string | null) ?? null,
    });

    if (threads.length >= limit) break;
  }

  return NextResponse.json({ threads });
}
