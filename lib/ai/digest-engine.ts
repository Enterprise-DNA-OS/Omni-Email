/**
 * Digest Engine — Feature: Email Digest System
 *
 * Queries threads matching a digest config's filters, sends them to the
 * ai-digest edge function, stores the result in digest_entries, and updates
 * the config's last_digest_at / next_digest_at timestamps.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DigestConfig {
  id: string;
  user_id: string;
  name: string;
  frequency: "daily" | "weekly" | "never";
  schedule_time: string | null;
  schedule_day_of_week: number | null;
  include_categories: string[];
  include_tags: string[];
  include_senders: string[];
  enabled: boolean;
  last_digest_at: string | null;
  next_digest_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DigestEntry {
  id: string;
  digest_config_id: string;
  user_id: string;
  title: string;
  summary: string;
  thread_count: number;
  thread_ids: string[];
  period_start: string;
  period_end: string;
  status: "pending" | "generating" | "ready" | "failed";
  generated_at: string | null;
  delivered: boolean;
  delivered_at: string | null;
  created_at: string;
}

interface ThreadRow {
  id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_summary: string | null;
  ai_intent: string | null;
  last_message_at: string | null;
}

interface AiDigestResult {
  title: string;
  executiveSummary: string;
  keyHighlights: Array<{ subject: string; sender: string; reason: string }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  actionItems: string[];
  threadCount: number;
  period: string;
}

// ---------------------------------------------------------------------------
// Edge function call
// ---------------------------------------------------------------------------

async function callDigestEdgeFunction(payload: {
  threads: Array<{
    id: string;
    subject: string;
    senderName: string;
    senderEmail: string;
    aiCategory: string | null;
    aiPriority: string | null;
    aiSummary: string | null;
    aiIntent: string | null;
    lastMessageAt: string;
  }>;
  configName: string;
  periodStart: string;
  periodEnd: string;
  categories: string[];
}): Promise<AiDigestResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-digest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-digest error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { digest?: AiDigestResult; error?: string };
  if (!data.digest) {
    throw new Error(data.error ?? "ai-digest returned no result");
  }
  return data.digest;
}

// ---------------------------------------------------------------------------
// Next digest time calculation
// ---------------------------------------------------------------------------

function computeNextDigestAt(config: DigestConfig, now: Date): Date | null {
  if (config.frequency === "never") return null;

  const [hours, minutes] = (config.schedule_time ?? "08:00").split(":").map(Number);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes);

  if (config.frequency === "daily") {
    // If the scheduled time today has already passed, move to tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (config.frequency === "weekly") {
    const targetDay = config.schedule_day_of_week ?? 1; // default Monday
    const currentDay = next.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    // If it's the right day but the time has passed, schedule for next week
    if (daysUntil === 0 && next <= now) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
    return next;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

/**
 * Generate a digest for the given config.
 * Creates a digest_entries row (status=ready on success, status=failed on error).
 * Updates digest_config.last_digest_at and next_digest_at.
 *
 * Returns the created digest entry id.
 */
export async function generateDigest(
  configId: string,
  userId: string,
): Promise<string> {
  const supabase = createAdminClient();
  const now = new Date();

  // 1. Load the config
  const { data: config, error: configErr } = await supabase
    .from("digest_config")
    .select("*")
    .eq("id", configId)
    .eq("user_id", userId)
    .single();

  if (configErr || !config) {
    throw new Error("Digest config not found");
  }

  const typedConfig = config as DigestConfig;

  // 2. Determine the period
  const periodEnd = now;
  const periodStart = typedConfig.last_digest_at
    ? new Date(typedConfig.last_digest_at)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000); // default: last 24h

  // 3. Create a pending digest entry
  const { data: entry, error: entryErr } = await supabase
    .from("digest_entries")
    .insert({
      digest_config_id: configId,
      user_id: userId,
      title: `${typedConfig.name} — generating...`,
      summary: "",
      thread_count: 0,
      thread_ids: [],
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      status: "generating",
    })
    .select("id")
    .single();

  if (entryErr || !entry) {
    throw new Error("Failed to create digest entry");
  }

  const entryId = (entry as { id: string }).id;

  try {
    // 4. Query matching threads
    let query = supabase
      .from("threads")
      .select(
        "id, subject, sender_name, sender_email, ai_category, ai_priority, ai_summary, ai_intent, last_message_at",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("archived_at", null)
      .gte("last_message_at", periodStart.toISOString())
      .lte("last_message_at", periodEnd.toISOString())
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (typedConfig.include_categories.length > 0) {
      query = query.in("ai_category", typedConfig.include_categories);
    }

    if (typedConfig.include_senders.length > 0) {
      query = query.in("sender_email", typedConfig.include_senders);
    }

    const { data: threads, error: threadErr } = await query;

    if (threadErr) {
      throw new Error(`Failed to query threads: ${threadErr.message}`);
    }

    let matchingThreads = (threads ?? []) as ThreadRow[];

    // 5. Filter by tags if specified
    if (typedConfig.include_tags.length > 0) {
      // Get tag ids for the given tag names
      const { data: tagRows } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", userId)
        .in("name", typedConfig.include_tags);

      const tagIds = (tagRows ?? []).map((t: { id: string }) => t.id);

      if (tagIds.length > 0) {
        const threadIdSet = new Set(matchingThreads.map((t) => t.id));
        const { data: taggedThreads } = await supabase
          .from("thread_tags")
          .select("thread_id")
          .in("tag_id", tagIds)
          .in("thread_id", Array.from(threadIdSet));

        const taggedIds = new Set(
          (taggedThreads ?? []).map((r: { thread_id: string }) => r.thread_id),
        );
        matchingThreads = matchingThreads.filter((t) => taggedIds.has(t.id));
      } else {
        matchingThreads = [];
      }
    }

    const threadIds = matchingThreads.map((t) => t.id);

    // 6. If no threads, store an empty digest
    if (matchingThreads.length === 0) {
      const emptyTitle = `${typedConfig.name}: no new threads`;
      await supabase
        .from("digest_entries")
        .update({
          title: emptyTitle,
          summary: JSON.stringify({
            executiveSummary: "No threads matched your digest filters in this period.",
            keyHighlights: [],
            categoryBreakdown: [],
            actionItems: [],
            threadCount: 0,
            period: `${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`,
          }),
          thread_count: 0,
          thread_ids: [],
          status: "ready",
          generated_at: now.toISOString(),
        })
        .eq("id", entryId);

      await updateConfigTimestamps(supabase, configId, typedConfig, now);
      return entryId;
    }

    // 7. Call the AI edge function
    const aiResult = await callDigestEdgeFunction({
      threads: matchingThreads.map((t) => ({
        id: t.id,
        subject: t.subject ?? "(no subject)",
        senderName: t.sender_name ?? "",
        senderEmail: t.sender_email ?? "",
        aiCategory: t.ai_category,
        aiPriority: t.ai_priority,
        aiSummary: t.ai_summary,
        aiIntent: t.ai_intent,
        lastMessageAt: t.last_message_at ?? "",
      })),
      configName: typedConfig.name,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      categories: typedConfig.include_categories,
    });

    // 8. Store the result
    await supabase
      .from("digest_entries")
      .update({
        title: aiResult.title,
        summary: JSON.stringify(aiResult),
        thread_count: matchingThreads.length,
        thread_ids: threadIds,
        status: "ready",
        generated_at: now.toISOString(),
      })
      .eq("id", entryId);

    // 9. Update config timestamps
    await updateConfigTimestamps(supabase, configId, typedConfig, now);

    return entryId;
  } catch (err) {
    // Mark the entry as failed
    const msg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("digest_entries")
      .update({ status: "failed", summary: msg })
      .eq("id", entryId);

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateConfigTimestamps(
  supabase: ReturnType<typeof createAdminClient>,
  configId: string,
  config: DigestConfig,
  now: Date,
): Promise<void> {
  const nextDigestAt = computeNextDigestAt(config, now);
  await supabase
    .from("digest_config")
    .update({
      last_digest_at: now.toISOString(),
      next_digest_at: nextDigestAt?.toISOString() ?? null,
      updated_at: now.toISOString(),
    })
    .eq("id", configId);
}
