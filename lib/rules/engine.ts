/**
 * Rules Engine — Main Evaluation Engine
 *
 * Fetches a user's enabled rules (ordered by priority DESC), loads thread
 * data from the database, evaluates all conditions, and executes the first
 * matching rule's actions.
 *
 * Only threads that have been AI-classified (ai_processed_at IS NOT NULL)
 * and not yet processed by rules (rules_processed_at IS NULL) are eligible.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";
import { evaluateConditions, type Condition, type ThreadData } from "@/lib/rules/conditions";
import { executeAction, type Action } from "@/lib/rules/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleRow {
  id: string;
  name: string;
  conditions: Condition[];
  actions: Action[];
  priority: number;
}

interface ThreadRow {
  id: string;
  user_id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_intent: string | null;
  primary_account_id: string | null;
}

// ---------------------------------------------------------------------------
// Thread data loader
// ---------------------------------------------------------------------------

/**
 * Load the full ThreadData shape needed by condition evaluators.
 * Fetches the thread row plus additional signals derived from messages.
 */
async function loadThreadData(threadId: string): Promise<ThreadData | null> {
  const admin = createAdminClient();

  const { data: thread } = await admin
    .from("threads")
    .select(
      "id, user_id, subject, sender_email, sender_name, ai_category, ai_priority, ai_intent, primary_account_id",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return null;

  const t = thread as ThreadRow;

  // Derive sender_domain from sender_email
  const senderDomain = t.sender_email
    ? (t.sender_email.split("@")[1] ?? null)
    : null;

  // Fetch body from the earliest message (thread originator)
  const { data: firstMessage } = await admin
    .from("messages")
    .select("body_text, body_html, attachments, account_id")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const bodyText =
    (firstMessage?.body_text as string | null) ??
    (firstMessage?.body_html
      ? stripHtml(firstMessage.body_html as string).slice(0, 2000)
      : null);

  const attachments = (firstMessage?.attachments as unknown[]) ?? [];
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  // Determine if this is a first-time sender by checking if any older thread
  // exists from the same sender email
  let isFirstTimeSender = false;
  if (t.sender_email) {
    const { count } = await admin
      .from("threads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", t.user_id)
      .eq("sender_email", t.sender_email)
      .neq("id", threadId);

    isFirstTimeSender = (count ?? 0) === 0;
  }

  return {
    senderEmail: t.sender_email,
    senderDomain,
    subject: t.subject,
    body: bodyText,
    aiCategory: t.ai_category,
    aiPriority: t.ai_priority,
    aiIntent: t.ai_intent,
    hasAttachments,
    isFirstTimeSender,
    accountId: t.primary_account_id,
  };
}

// ---------------------------------------------------------------------------
// Rules fetcher
// ---------------------------------------------------------------------------

async function fetchEnabledRules(userId: string): Promise<RuleRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rules")
    .select("id, name, conditions, actions, priority")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("priority", { ascending: false });

  if (error) {
    throw new Error(`rules/engine: failed to fetch rules: ${error.message}`);
  }

  return (data ?? []) as RuleRow[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all enabled rules for a user against a specific thread.
 * Executes actions for the FIRST matching rule (priority wins).
 *
 * Returns the matched rule id if any rule fired, or null if none matched.
 */
export async function evaluateRules(
  userId: string,
  threadId: string,
): Promise<string | null> {
  const [rules, threadData] = await Promise.all([
    fetchEnabledRules(userId),
    loadThreadData(threadId),
  ]);

  if (!threadData) {
    console.warn(`rules/engine: thread ${threadId} not found — skipping`);
    return null;
  }

  if (rules.length === 0) {
    return null;
  }

  let matchedRuleId: string | null = null;

  for (const rule of rules) {
    const conditions = Array.isArray(rule.conditions) ? (rule.conditions as Condition[]) : [];
    const matched = evaluateConditions(conditions, threadData);

    if (!matched) continue;

    // Execute all actions for this rule
    const actions = Array.isArray(rule.actions) ? (rule.actions as Action[]) : [];
    for (const action of actions) {
      try {
        await executeAction(action, threadId, userId);
      } catch (e) {
        console.error(
          `rules/engine: action "${action.type}" failed for thread ${threadId} (rule ${rule.id}):`,
          e,
        );
        // Continue executing remaining actions; one failure does not abort the rest
      }
    }

    matchedRuleId = rule.id;

    // Track match stats — non-fatal if this fails.
    // Use a single UPDATE with match_count = match_count + 1 expressed via
    // a raw SQL increment so the read-modify-write is handled in one round-trip.
    // The Supabase PostgREST client does not have a native increment helper,
    // so we use the rpc helper if available; otherwise fall back to the two-step
    // approach which is acceptable for a low-frequency background job.
    try {
      const admin = createAdminClient();
      const { error: rpcErr } = await admin.rpc("increment_rule_match_count", {
        rule_id: rule.id,
        matched_at: new Date().toISOString(),
      });
      if (rpcErr) {
        // RPC may not exist yet — fall back to read-then-write (best-effort)
        const { data: current } = await admin
          .from("rules")
          .select("match_count")
          .eq("id", rule.id)
          .maybeSingle();
        const currentCount =
          typeof current?.match_count === "number" ? current.match_count : 0;
        await admin
          .from("rules")
          .update({
            match_count: currentCount + 1,
            last_matched_at: new Date().toISOString(),
          })
          .eq("id", rule.id);
      }
    } catch {
      // Non-fatal
    }

    // First-match semantics: stop after first matching rule
    break;
  }

  // Mark thread as processed by rules engine regardless of whether a rule matched
  const admin = createAdminClient();
  await admin
    .from("threads")
    .update({ rules_processed_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);

  return matchedRuleId;
}

/**
 * Evaluate rules for all recently classified, unprocessed threads for a user.
 * Called from the sync pipeline after AI classification.
 *
 * Only processes threads where:
 *   - ai_processed_at IS NOT NULL (classification completed)
 *   - rules_processed_at IS NULL (not yet run through rules)
 *   - archived_at IS NULL (still active)
 */
export async function evaluateRulesForNewThreads(
  userId: string,
  limit = 10,
): Promise<{ processed: number; matched: number; errors: number }> {
  const admin = createAdminClient();

  const { data: threads, error } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId)
    .not("ai_processed_at", "is", null)
    .is("rules_processed_at", null)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`rules/engine: failed to fetch unprocessed threads: ${error.message}`);
  }

  let processed = 0;
  let matched = 0;
  let errors = 0;

  for (const t of threads ?? []) {
    const threadId = t.id as string;
    try {
      const matchedRuleId = await evaluateRules(userId, threadId);
      processed++;
      if (matchedRuleId) {
        matched++;
      }
    } catch (e) {
      console.error(`rules/engine: evaluateRules failed for thread ${threadId}:`, e);
      errors++;

      // Even on error, mark processed so we don't retry infinitely
      try {
        await admin
          .from("threads")
          .update({ rules_processed_at: new Date().toISOString() })
          .eq("id", threadId)
          .eq("user_id", userId);
      } catch {
        // Ignore secondary failure
      }
    }
  }

  return { processed, matched, errors };
}

