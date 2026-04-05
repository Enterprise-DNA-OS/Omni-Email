/**
 * Catch Me Up — server-side data gathering and edge function orchestration.
 *
 * Queries threads modified since `since` (or the user's last_session_at),
 * groups them by priority and intent, then calls the ai-catch-me-up edge
 * function to produce a narrative briefing.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface ThreadCard {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  priority: string;
  intent: string;
  lastMessageAt: string;
}

export interface CatchMeUpBriefing {
  narrative: string;
  estimatedClearTime: string | null;
  urgentThreads: ThreadCard[];
  needsDecision: ThreadCard[];
  updates: ThreadCard[];
  autoHandled: number;
  pendingApprovals: number;
  stats: {
    totalNew: number;
    sinceLabel: string;
  };
}

/**
 * Generate a catch-me-up briefing for the authenticated user.
 *
 * @param userId  — The authenticated user's UUID (from session)
 * @param since   — ISO timestamp; defaults to the user's last_session_at, then 24 hours ago
 */
export async function generateCatchMeUp(
  userId: string,
  since?: string,
): Promise<CatchMeUpBriefing> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are not configured");
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Resolve the "since" timestamp: explicit arg → last_session_at → 24h ago
  let sinceTs: string;
  let sinceLabel: string;
  if (since) {
    sinceTs = since;
    sinceLabel = new Date(since).toLocaleString();
  } else {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("last_session_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (prefs?.last_session_at) {
      sinceTs = prefs.last_session_at as string;
      sinceLabel = new Date(sinceTs).toLocaleString();
    } else {
      const ago = new Date(Date.now() - 24 * 60 * 60 * 1000);
      sinceTs = ago.toISOString();
      sinceLabel = "24 hours ago";
    }
  }

  // Fetch threads modified since the resolved timestamp
  const { data: threads } = await supabase
    .from("threads")
    .select(
      "id, subject, snippet, last_message_at, sender_name, sender_email, ai_priority, ai_category, ai_intent",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("last_message_at", sinceTs)
    .order("last_message_at", { ascending: false })
    .limit(50);

  const allThreads = threads ?? [];

  // Map threads to ThreadCard, using ai_intent for the intent field
  function toCard(t: (typeof allThreads)[number]): ThreadCard {
    return {
      id: t.id as string,
      subject: (t.subject as string) ?? "(no subject)",
      sender: (t.sender_name as string) ?? (t.sender_email as string) ?? "Unknown",
      snippet: stripHtml((t.snippet as string) ?? "").slice(0, 200),
      priority: (t.ai_priority as string) ?? "normal",
      intent: (t.ai_intent as string) ?? "update",
      lastMessageAt: (t.last_message_at as string) ?? sinceTs,
    };
  }

  const urgentThreads = allThreads
    .filter((t) => (t.ai_priority as string) === "urgent")
    .map(toCard);

  // needsDecision: threads where ai_intent signals the user must act
  const DECISION_INTENTS = new Set(["reply", "reply_urgent", "review", "delegate", "pay"]);
  const needsDecision = allThreads
    .filter(
      (t) =>
        (t.ai_priority as string) !== "urgent" &&
        DECISION_INTENTS.has((t.ai_intent as string) ?? ""),
    )
    .map(toCard);

  const updates = allThreads
    .filter(
      (t) =>
        !urgentThreads.some((u) => u.id === (t.id as string)) &&
        !needsDecision.some((d) => d.id === (t.id as string)),
    )
    .slice(0, 10)
    .map(toCard);

  // Count pending approvals (threads in "approval_request" category, unarchived)
  const { count: pendingApprovals } = await supabase
    .from("threads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("ai_category", "approval_request")
    .is("archived_at", null);

  // Count auto-handled actions from audit_log since sinceTs.
  // Automated AI-driven actions are recorded with actor='system' or actor='rule'.
  let autoHandled = 0;
  const { count: auditCount } = await adminClient
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceTs)
    .in("actor", ["system", "rule"]);
  autoHandled = auditCount ?? 0;

  const context = {
    urgentThreads,
    needsDecision,
    updates,
    autoHandled,
    pendingApprovals: pendingApprovals ?? 0,
    stats: {
      totalNew: allThreads.length,
      sinceLabel,
    },
  };

  // Call the edge function
  const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-catch-me-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ context }),
  });

  if (efRes.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!efRes.ok) {
    const text = await efRes.text();
    throw new Error(`AI service error (${efRes.status}): ${text}`);
  }

  const { narrative, estimatedClearTime } = (await efRes.json()) as {
    narrative: string;
    estimatedClearTime: string | null;
  };

  return {
    narrative,
    estimatedClearTime,
    urgentThreads,
    needsDecision,
    updates,
    autoHandled,
    pendingApprovals: pendingApprovals ?? 0,
    stats: { totalNew: allThreads.length, sinceLabel },
  };
}
