import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import { enqueueForApproval } from "@/lib/approval/queue";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Priority = "urgent" | "high" | "normal" | "low" | "ignore";

type Intent =
  | "reply"
  | "reply_urgent"
  | "archive"
  | "delete"
  | "delegate"
  | "schedule"
  | "pay"
  | "review"
  | "ignore"
  | "unsubscribe"
  | "follow_up"
  | "no_action";

export interface AiSignal {
  type: "risk" | "opportunity";
  signal: string;
  severity: "high" | "medium" | "low";
}

export interface ClassifyResult {
  summary: string;
  category: string;
  priority: Priority;
  tags: string[];
  intent: Intent;
  confidence: number;
  reasoning: string;
  signals: AiSignal[];
}

const VALID_PRIORITIES: Priority[] = ["urgent", "high", "normal", "low", "ignore"];
const VALID_INTENTS: Intent[] = [
  "reply",
  "reply_urgent",
  "archive",
  "delete",
  "delegate",
  "schedule",
  "pay",
  "review",
  "ignore",
  "unsubscribe",
  "follow_up",
  "no_action",
];

function parseClassifyResponse(raw: string): ClassifyResult {
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<ClassifyResult>;

    if (!parsed.summary || !parsed.category || !parsed.priority) {
      throw new Error("Missing required fields");
    }
    if (!VALID_PRIORITIES.includes(parsed.priority)) {
      parsed.priority = "normal";
    }
    if (!Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }
    parsed.tags = (parsed.tags as string[])
      .slice(0, 4)
      .map((t) => String(t).toLowerCase().replace(/\s+/g, "-"));

    if (!parsed.intent || !VALID_INTENTS.includes(parsed.intent)) {
      parsed.intent = "no_action";
    }
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    parsed.confidence = Math.min(1, Math.max(0, confidence));
    if (!parsed.reasoning || typeof parsed.reasoning !== "string") {
      parsed.reasoning = "";
    }

    // Validate and normalise signals array
    const VALID_SIGNAL_TYPES = ["risk", "opportunity"];
    const VALID_SEVERITIES = ["high", "medium", "low"];
    if (!Array.isArray((parsed as Partial<ClassifyResult>).signals)) {
      (parsed as Partial<ClassifyResult>).signals = [];
    }
    (parsed as Partial<ClassifyResult>).signals = (
      (parsed as Partial<ClassifyResult>).signals as AiSignal[]
    )
      .filter(
        (s): s is AiSignal =>
          typeof s === "object" &&
          s !== null &&
          VALID_SIGNAL_TYPES.includes(s.type) &&
          typeof s.signal === "string" &&
          VALID_SEVERITIES.includes(s.severity),
      )
      .slice(0, 10);

    return parsed as ClassifyResult;
  } catch {
    return {
      summary: raw.slice(0, 300),
      category: "other",
      priority: "normal",
      tags: [],
      intent: "no_action",
      confidence: 0.5,
      reasoning: "",
      signals: [],
    };
  }
}

/**
 * Call the ai-classify edge function directly with pre-formatted messages.
 * This avoids the legacy generateAIResponse shim for the background pipeline.
 */
async function callClassifyEdgeFunction(
  subject: string,
  messages: { sender: string; body: string }[],
): Promise<ClassifyResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-classify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ subject, messages }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-classify error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as Partial<ClassifyResult>;
  // Parse through the same validator so defaults are applied consistently
  return parseClassifyResponse(JSON.stringify(data));
}

/**
 * Classify a single thread by ID. Uses admin client (no auth context needed).
 * Safe to call from sync pipeline.
 */
export async function classifyThreadById(threadId: string): Promise<ClassifyResult | null> {
  const admin = createAdminClient();

  const { data: thread } = await admin
    .from("threads")
    .select("id, subject, user_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return null;

  const { data: messages } = await admin
    .from("messages")
    .select("sender, body_html, body_text, message_at")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: true })
    .limit(10);

  const formattedMessages = (messages ?? []).map((m) => ({
    sender: (m.sender as string) ?? "Unknown",
    body: (
      (m.body_text as string) ||
      (m.body_html ? stripHtml(m.body_html as string) : "")
    ).slice(0, 1500),
  }));

  const classification = await callClassifyEdgeFunction(
    (thread.subject as string) ?? "(no subject)",
    formattedMessages,
  );

  // Update thread with all AI fields including signals for risk/opportunity detection
  await admin
    .from("threads")
    .update({
      ai_summary: classification.summary,
      ai_category: classification.category,
      ai_priority: classification.priority,
      ai_tags: classification.tags,
      ai_intent: classification.intent,
      ai_confidence: classification.confidence,
      ai_reasoning: classification.reasoning,
      ai_signals: classification.signals,
      ai_processed_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  // Auto-create and assign tags
  const userId = thread.user_id as string;
  for (const tagName of classification.tags) {
    const { data: existing } = await admin
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .eq("name", tagName)
      .maybeSingle();

    let tagId: string;
    if (existing) {
      tagId = existing.id as string;
    } else {
      const { data: newTag, error: tagErr } = await admin
        .from("tags")
        .insert({ user_id: userId, name: tagName })
        .select("id")
        .single();
      if (tagErr || !newTag) continue;
      tagId = newTag.id as string;
    }

    await admin
      .from("thread_tags")
      .upsert(
        { thread_id: threadId, tag_id: tagId },
        { onConflict: "thread_id,tag_id" },
      );
  }

  // Approval queue routing
  // Actionable intents that require human sign-off in the medium-confidence range
  const ACTIONABLE_INTENTS: Intent[] = ["archive", "delete", "unsubscribe", "ignore"];
  const isActionable = ACTIONABLE_INTENTS.includes(classification.intent);

  if (isActionable) {
    const confidence = classification.confidence;

    if (confidence >= 0.85) {
      // High confidence — Tier 2 will wire immediate execution; no queue entry needed
    } else if (confidence >= 0.5) {
      // Medium confidence — send to approval queue for human review
      try {
        await enqueueForApproval({
          userId,
          threadId,
          proposedAction: classification.intent,
          proposedDetails: {},
          confidence,
          reasoning: classification.reasoning,
        });
      } catch (e) {
        // Non-fatal: classification result is still returned even if enqueue fails
        console.error(`enqueueForApproval failed for thread ${threadId}:`, e);
      }
    }
    // confidence < 0.5 — low confidence, do nothing (suggestion stored on thread row only)
  }

  return classification;
}

/**
 * Classify all unprocessed threads for a user. Called after sync.
 */
export async function classifyUnprocessedThreads(
  userId: string,
  limit = 5,
): Promise<{ processed: number; errors: number }> {
  const admin = createAdminClient();
  const { data: threads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId)
    .is("ai_processed_at", null)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  let processed = 0;
  let errors = 0;

  for (const t of threads ?? []) {
    try {
      await classifyThreadById(t.id as string);
      processed++;
    } catch (e) {
      console.error(`AI classify failed for thread ${t.id}:`, e);
      errors++;
    }
  }

  return { processed, errors };
}
