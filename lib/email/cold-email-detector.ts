/**
 * Cold Email Detection Engine
 *
 * Orchestrates cold email detection for a single email thread:
 * 1. Checks sender history via the contacts table
 * 2. Skips senders already classified as VIP or trusted_domain
 * 3. Calls the ai-cold-email edge function for classification
 * 4. Logs the result to cold_email_log
 * 5. Applies actions based on the user's cold_email_mode setting:
 *    - 'list': log only (action = 'none')
 *    - 'label': log + apply "Cold Email" tag
 *    - 'archive': log + apply tag + archive thread
 *
 * INTEGRATION POINT FOR SYNC:
 * This function should be called from lib/email/sync.ts after a new thread
 * is inserted and AI classification has run. The ideal place is at the end of
 * the per-thread processing block, after `ai_priority` and `ai_category` are
 * written to the threads row. Example call site:
 *
 *   // In the sync loop, after upsertThread():
 *   if (coldEmailSettings.enabled) {
 *     await detectAndHandleColdEmail({
 *       supabase: adminClient,
 *       userId,
 *       threadId: thread.id,
 *       senderEmail: thread.sender_email,
 *       subject: thread.subject,
 *       bodySnippet: thread.snippet ?? "",
 *       settings: coldEmailSettings,
 *     });
 *   }
 *
 * Do NOT import sync.ts here — this file is the standalone feature module.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface ColdEmailSettings {
  enabled: boolean;
  mode: "list" | "label" | "archive";
  customCriteria?: string | null;
}

export interface ColdEmailDetectionInput {
  /** Supabase client — pass an admin client from the caller context */
  supabase?: SupabaseClient;
  userId: string;
  threadId: string;
  senderEmail: string;
  subject: string;
  /** Raw HTML or plain text body snippet */
  bodySnippet: string;
  settings: ColdEmailSettings;
}

export interface ColdEmailDetectionResult {
  skipped: boolean;
  skipReason?: string;
  isColdEmail?: boolean;
  confidence?: number;
  reasoning?: string;
  signals?: string[];
  actionTaken?: "none" | "labeled" | "archived";
  logId?: string;
}

interface AiColdEmailResult {
  isColdEmail: boolean;
  confidence: number;
  reasoning: string;
  signals: string[];
  error?: string;
}

/** Call the ai-cold-email Supabase Edge Function */
async function callColdEmailEdgeFunction(payload: {
  senderEmail: string;
  subject: string;
  bodySnippet: string;
  senderHistory: number;
  customCriteria?: string | null;
}): Promise<AiColdEmailResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const url = `${SUPABASE_URL}/functions/v1/ai-cold-email`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      senderEmail: payload.senderEmail,
      subject: payload.subject,
      bodySnippet: payload.bodySnippet,
      senderHistory: payload.senderHistory,
      customCriteria: payload.customCriteria ?? undefined,
    }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-cold-email edge function error (${res.status}): ${text}`);
  }

  return res.json() as Promise<AiColdEmailResult>;
}

/**
 * Extract the sender domain from an email address.
 * Returns null if the address is malformed.
 */
function extractDomain(email: string): string | null {
  const parts = email.split("@");
  return parts.length === 2 && parts[1] ? parts[1].toLowerCase() : null;
}

/**
 * Find or create the "Cold Email" tag for a user.
 * Returns the tag id.
 */
async function getOrCreateColdEmailTag(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "Cold Email")
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from("tags")
    .insert({ user_id: userId, name: "Cold Email", color: "#f97316" })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(`Failed to create Cold Email tag: ${error?.message ?? "unknown"}`);
  }
  return created.id as string;
}

/**
 * Main detection orchestrator. Call this from the sync pipeline for each
 * new inbound thread when cold email blocking is enabled.
 */
export async function detectAndHandleColdEmail(
  input: ColdEmailDetectionInput,
): Promise<ColdEmailDetectionResult> {
  const { userId, threadId, senderEmail, subject, bodySnippet, settings } = input;

  if (!settings.enabled) {
    return { skipped: true, skipReason: "cold email detection disabled" };
  }

  const supabase = input.supabase ?? createAdminClient();

  // 1. Skip senders already classified as VIP or safe (trusted)
  const senderDomain = extractDomain(senderEmail);
  const lookupValues = [senderEmail.toLowerCase()];
  if (senderDomain) lookupValues.push(senderDomain);

  const { data: classification } = await supabase
    .from("sender_classifications")
    .select("classification")
    .eq("user_id", userId)
    .in("email_or_domain", lookupValues)
    .maybeSingle();

  if (
    classification &&
    (classification.classification === "vip" ||
      classification.classification === "safe")
  ) {
    return {
      skipped: true,
      skipReason: `sender is classified as ${classification.classification as string}`,
    };
  }

  // 2. Check sender history via threads — messages don't have a user_id column
  // so we scope to the user's threads first, then count matching messages.
  const { data: userThreadIds } = await supabase
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  const threadIds = (userThreadIds ?? []).map((t) => t.id as string);

  let priorMessageCount = 0;
  if (threadIds.length > 0) {
    const { count: senderHistory } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .ilike("sender", `%${senderEmail}%`);
    priorMessageCount = senderHistory ?? 0;
  }

  // If sender has meaningful history, skip — they're a known contact
  if (priorMessageCount >= 3) {
    return {
      skipped: true,
      skipReason: `sender has ${priorMessageCount} prior messages`,
    };
  }

  // 3. Call AI classification
  const plainSnippet = stripHtml(bodySnippet);

  let aiResult: AiColdEmailResult;
  try {
    aiResult = await callColdEmailEdgeFunction({
      senderEmail,
      subject,
      bodySnippet: plainSnippet,
      senderHistory: priorMessageCount,
      customCriteria: settings.customCriteria,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown AI error";
    // Don't block email delivery on AI errors — log and skip
    console.error("[cold-email-detector] AI call failed:", msg);
    return { skipped: true, skipReason: `AI error: ${msg}` };
  }

  if (!aiResult.isColdEmail) {
    return {
      skipped: false,
      isColdEmail: false,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      signals: aiResult.signals,
      actionTaken: "none",
    };
  }

  // 4. Determine action based on mode
  let actionTaken: "none" | "labeled" | "archived" = "none";

  if (settings.mode === "label" || settings.mode === "archive") {
    try {
      const tagId = await getOrCreateColdEmailTag(supabase, userId);
      // Apply tag via thread_tags junction
      await supabase
        .from("thread_tags")
        .upsert({ thread_id: threadId, tag_id: tagId }, { onConflict: "thread_id,tag_id" });
      actionTaken = "labeled";
    } catch (err) {
      console.error("[cold-email-detector] Failed to apply label:", err);
    }
  }

  if (settings.mode === "archive") {
    const { error: archiveError } = await supabase
      .from("threads")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("user_id", userId);
    if (!archiveError) {
      actionTaken = "archived";
    } else {
      console.error("[cold-email-detector] Failed to archive thread:", archiveError.message);
    }
  }

  // 5. Log to cold_email_log
  const { data: logEntry, error: logError } = await supabase
    .from("cold_email_log")
    .upsert(
      {
        user_id: userId,
        thread_id: threadId,
        sender_email: senderEmail,
        sender_domain: senderDomain,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        action_taken: actionTaken,
        is_false_positive: false,
        detected_at: new Date().toISOString(),
      },
      { onConflict: "thread_id" },
    )
    .select("id")
    .single();

  if (logError) {
    console.error("[cold-email-detector] Failed to write log:", logError.message);
  }

  return {
    skipped: false,
    isColdEmail: true,
    confidence: aiResult.confidence,
    reasoning: aiResult.reasoning,
    signals: aiResult.signals,
    actionTaken,
    logId: logEntry?.id as string | undefined,
  };
}
