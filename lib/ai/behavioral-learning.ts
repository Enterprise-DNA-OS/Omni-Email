/**
 * Behavioral Learning — Feature 4.2
 *
 * Records implicit user signals (read, archive, delete, reply, etc.) and
 * uses them to detect patterns and generate rule suggestions via AI.
 *
 * Signal recording uses the admin client so it works from any server context.
 * Pattern detection and AI rule generation are called from the API route.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type SignalType =
  | "read"
  | "archived"
  | "deleted"
  | "replied"
  | "ignored"
  | "opened"
  | "snoozed";

export interface BehaviorSignal {
  id: string;
  userId: string;
  threadId: string | null;
  signalType: SignalType;
  timeToActionSeconds: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DetectedPattern {
  signalType: SignalType;
  senderDomain: string | null;
  senderAddress: string | null;
  count: number;
  exampleSubjects: string[];
}

export interface RuleSuggestion {
  description: string;
  condition: string;
  action: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

/**
 * Record a user behavior signal. Fire-and-forget safe — callers can void this.
 * Uses admin client because many callers (e.g. archive route) already hold a
 * user-scoped Supabase client, but we need a guaranteed write path.
 */
export async function recordSignal(
  userId: string,
  threadId: string | null,
  signalType: SignalType,
  timeToActionSeconds?: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("behavior_signals").insert({
    user_id: userId,
    thread_id: threadId ?? null,
    signal_type: signalType,
    time_to_action_seconds: timeToActionSeconds ?? null,
    metadata: metadata ?? {},
  });
}

/**
 * Analyze recent behavior signals for a user and extract patterns.
 * Looks at the last 500 signals over the past 30 days.
 * Returns patterns where the same action was taken 5+ times for a sender.
 */
export async function detectPatterns(userId: string): Promise<DetectedPattern[]> {
  const admin = createAdminClient();

  // Fetch recent signals joined with thread/message data for sender info
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: signals } = await admin
    .from("behavior_signals")
    .select("signal_type, thread_id, created_at")
    .eq("user_id", userId)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!signals || signals.length === 0) return [];

  // Gather thread IDs that have signals
  const threadIds = [
    ...new Set(
      (signals as Array<{ thread_id: string | null }>)
        .map((s) => s.thread_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (threadIds.length === 0) return [];

  // Fetch sender info for those threads via messages
  const { data: messages } = await admin
    .from("messages")
    .select("thread_id, sender")
    .in("thread_id", threadIds)
    .order("message_at", { ascending: true });

  // Fetch subjects for context
  const { data: threads } = await admin
    .from("threads")
    .select("id, subject")
    .in("id", threadIds);

  // Build lookup maps
  const senderByThread = new Map<string, string>();
  for (const msg of messages ?? []) {
    const threadId = msg.thread_id as string;
    if (!senderByThread.has(threadId)) {
      senderByThread.set(threadId, (msg.sender as string) ?? "");
    }
  }

  const subjectByThread = new Map<string, string>();
  for (const t of threads ?? []) {
    subjectByThread.set(t.id as string, (t.subject as string) ?? "");
  }

  // Group signals: key = signalType + sender
  interface GroupEntry {
    signalType: SignalType;
    senderAddress: string | null;
    senderDomain: string | null;
    count: number;
    subjects: Set<string>;
  }
  const groups = new Map<string, GroupEntry>();

  for (const s of signals as Array<{ signal_type: string; thread_id: string | null }>) {
    const sender = s.thread_id ? (senderByThread.get(s.thread_id) ?? null) : null;
    const domain = sender ? extractDomain(sender) : null;
    const groupKey = `${s.signal_type}::${sender ?? "unknown"}`;

    const existing = groups.get(groupKey);
    const subject = s.thread_id ? (subjectByThread.get(s.thread_id) ?? "") : "";

    if (existing) {
      existing.count++;
      if (subject) existing.subjects.add(subject);
    } else {
      groups.set(groupKey, {
        signalType: s.signal_type as SignalType,
        senderAddress: sender,
        senderDomain: domain,
        count: 1,
        subjects: subject ? new Set([subject]) : new Set(),
      });
    }
  }

  // Return patterns where count >= 5 (meaningful repetition), sorted by count desc
  return Array.from(groups.values())
    .filter((g) => g.count >= 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((g) => ({
      signalType: g.signalType,
      senderDomain: g.senderDomain,
      senderAddress: g.senderAddress,
      count: g.count,
      exampleSubjects: Array.from(g.subjects).slice(0, 3),
    }));
}

/**
 * Call the ai-suggest-rules edge function with detected patterns.
 * Returns proposed automation rules the user can review and enable.
 */
export async function generateRuleSuggestions(userId: string): Promise<RuleSuggestion[]> {
  const patterns = await detectPatterns(userId);
  if (patterns.length === 0) return [];

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-suggest-rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ patterns }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-suggest-rules error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { suggestions?: RuleSuggestion[] };
  return data.suggestions ?? [];
}

/** Extract the domain portion from an email address or "Sender Name <addr>" string. */
function extractDomain(sender: string): string | null {
  const match = sender.match(/<([^>]+)>/) ?? sender.match(/\S+@\S+/);
  const addr = match ? match[1] ?? match[0] : sender;
  const atIdx = addr.indexOf("@");
  if (atIdx === -1) return null;
  return addr.slice(atIdx + 1).toLowerCase().trim() || null;
}
