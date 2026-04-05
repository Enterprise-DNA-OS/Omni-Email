/**
 * Rules Engine — Action Executors
 *
 * Each action type corresponds to an automated operation performed on a thread.
 * Actions are executed by the rules engine on behalf of the user (actor: "rule").
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { archiveThreadRemote, deleteThreadRemote } from "@/lib/email/outbound";

export type ActionType =
  | "apply_tag"
  | "archive"
  | "delete"
  | "forward"
  | "star"
  | "set_priority"
  | "mark_vip"
  | "auto_reply"
  | "move_to_approval"
  | "suppress_ai";

export interface Action {
  type: ActionType;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve or create a tag by name for a user and return its id.
 */
async function resolveTagId(userId: string, tagName: string): Promise<string | null> {
  const admin = createAdminClient();
  const name = String(tagName).trim().toLowerCase();
  if (!name) return null;

  const { data: existing } = await admin
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error } = await admin
    .from("tags")
    .insert({ user_id: userId, name })
    .select("id")
    .single();

  if (error || !created) {
    console.error(`rules/actions: failed to create tag "${name}":`, error?.message);
    return null;
  }
  return created.id as string;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleApplyTag(
  threadId: string,
  userId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const tagName = params.tagName as string | undefined;
  if (!tagName) {
    console.warn(`rules/actions: apply_tag missing tagName param for thread ${threadId}`);
    return;
  }

  const tagId = await resolveTagId(userId, tagName);
  if (!tagId) return;

  const admin = createAdminClient();
  await admin
    .from("thread_tags")
    .upsert({ thread_id: threadId, tag_id: tagId }, { onConflict: "thread_id,tag_id" });

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.tag_applied",
    targetType: "thread",
    targetId: threadId,
    details: { tagName, tagId },
    reversible: false,
  });
}

async function handleArchive(
  threadId: string,
  userId: string,
): Promise<void> {
  // Always archive locally first so the thread disappears from inbox
  // regardless of whether the remote provider call succeeds.
  const admin = createAdminClient();
  await admin
    .from("threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);

  // Mirror to the provider (Gmail/Outlook). Non-fatal: a transient provider
  // error must not prevent the local state from being updated.
  try {
    await archiveThreadRemote({ threadId, userId });
  } catch (e) {
    console.warn(`rules/actions: remote archive failed for thread ${threadId} (non-fatal):`, e);
  }

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.archive",
    targetType: "thread",
    targetId: threadId,
    details: {},
    reversible: true,
  });
}

async function handleDelete(
  threadId: string,
  userId: string,
): Promise<void> {
  // Always remove locally first so the thread disappears from the UI
  // regardless of whether the remote provider call succeeds.
  const admin = createAdminClient();
  await admin.from("thread_tags").delete().eq("thread_id", threadId);
  await admin.from("thread_sources").delete().eq("thread_id", threadId);
  await admin.from("messages").delete().eq("thread_id", threadId);
  await admin.from("threads").delete().eq("id", threadId).eq("user_id", userId);

  // Mirror to the provider. Non-fatal: a transient provider error must not
  // prevent the local delete from taking effect.
  try {
    await deleteThreadRemote({ threadId, userId });
  } catch (e) {
    console.warn(`rules/actions: remote delete failed for thread ${threadId} (non-fatal):`, e);
  }

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.delete",
    targetType: "thread",
    targetId: threadId,
    details: {},
    reversible: false,
  });
}

async function handleStar(
  threadId: string,
  userId: string,
): Promise<void> {
  // Placeholder: starred_at column does not exist yet.
  // The column will be added in a future migration (Tier 3 feature).
  // Log the intent so history is preserved.
  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.star",
    targetType: "thread",
    targetId: threadId,
    details: { note: "placeholder — starred_at column pending migration" },
    reversible: false,
  });
}

async function handleSetPriority(
  threadId: string,
  userId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const priority = params.priority as string | undefined;
  const validPriorities = ["urgent", "high", "normal", "low", "ignore"];
  if (!priority || !validPriorities.includes(priority)) {
    console.warn(`rules/actions: set_priority invalid priority "${priority}" for thread ${threadId}`);
    return;
  }

  const admin = createAdminClient();
  await admin
    .from("threads")
    .update({ ai_priority: priority })
    .eq("id", threadId)
    .eq("user_id", userId);

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.priority_set",
    targetType: "thread",
    targetId: threadId,
    details: { priority },
    reversible: false,
  });
}

async function handleMarkVip(
  threadId: string,
  userId: string,
): Promise<void> {
  // Apply the built-in "vip" tag
  await handleApplyTag(threadId, userId, { tagName: "vip" });

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.mark_vip",
    targetType: "thread",
    targetId: threadId,
    details: {},
    reversible: false,
  });
}

async function handleSuppressAi(
  threadId: string,
  userId: string,
): Promise<void> {
  // Set ai_processed_at to a sentinel non-null value so the classifier skips it,
  // and record a special category so the UI can surface it.
  const admin = createAdminClient();
  await admin
    .from("threads")
    .update({
      ai_category: "suppressed",
      ai_processed_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("user_id", userId);

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.ai_suppressed",
    targetType: "thread",
    targetId: threadId,
    details: {},
    reversible: false,
  });
}

async function handleMoveToApproval(
  threadId: string,
  userId: string,
  params: Record<string, unknown>,
): Promise<void> {
  // Import dynamically to avoid circular deps with classify pipeline
  const { enqueueForApproval } = await import("@/lib/approval/queue");

  await enqueueForApproval({
    userId,
    threadId,
    proposedAction: (params.proposedAction as string) ?? "review",
    proposedDetails: (params.proposedDetails as Record<string, unknown>) ?? {},
    confidence: (params.confidence as number) ?? 1.0,
    reasoning: (params.reasoning as string) ?? "Triggered by user-defined rule",
  });

  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.moved_to_approval",
    targetType: "thread",
    targetId: threadId,
    details: { proposedAction: params.proposedAction },
    reversible: false,
  });
}

async function handleAutoReply(
  threadId: string,
  userId: string,
  params: Record<string, unknown>,
): Promise<void> {
  // Placeholder: auto-reply requires composing and sending a message,
  // which depends on user account selection. Full implementation is a Tier 3 task.
  await logAuditEvent({
    userId,
    actor: "rule",
    action: "thread.auto_reply_pending",
    targetType: "thread",
    targetId: threadId,
    details: { note: "placeholder — auto-reply not yet implemented", params },
    reversible: false,
  });
}

async function handleForward(
  threadId: string,
  userId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const toAddress = params.to as string | undefined;
  if (!toAddress || !toAddress.includes("@")) {
    console.warn(`rules/actions: forward missing or invalid "to" address for thread ${threadId}`);
    return;
  }

  // Resolve the account to send from: use params.accountId if provided, else
  // fall back to the most recent message's account.
  let accountId = params.accountId as string | undefined;
  if (!accountId) {
    const admin = createAdminClient();
    const { data: lastMsg } = await admin
      .from("messages")
      .select("account_id")
      .eq("thread_id", threadId)
      .order("message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    accountId = lastMsg?.account_id as string | undefined;
  }

  if (!accountId) {
    console.error(`rules/actions: forward could not resolve accountId for thread ${threadId}`);
    return;
  }

  const { executeForward } = await import("@/lib/email/auto-forward");
  await executeForward(threadId, accountId, toAddress, userId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a single action against a thread on behalf of a user.
 * Throws if the action fails in a way that should abort rule execution.
 */
export async function executeAction(
  action: Action,
  threadId: string,
  userId: string,
): Promise<void> {
  switch (action.type) {
    case "apply_tag":
      await handleApplyTag(threadId, userId, action.params);
      break;
    case "archive":
      await handleArchive(threadId, userId);
      break;
    case "delete":
      await handleDelete(threadId, userId);
      break;
    case "star":
      await handleStar(threadId, userId);
      break;
    case "set_priority":
      await handleSetPriority(threadId, userId, action.params);
      break;
    case "mark_vip":
      await handleMarkVip(threadId, userId);
      break;
    case "suppress_ai":
      await handleSuppressAi(threadId, userId);
      break;
    case "move_to_approval":
      await handleMoveToApproval(threadId, userId, action.params);
      break;
    case "auto_reply":
      await handleAutoReply(threadId, userId, action.params);
      break;
    case "forward":
      await handleForward(threadId, userId, action.params);
      break;
    default: {
      const exhaustive: never = action.type;
      console.warn(`rules/actions: unknown action type "${exhaustive}" — skipped`);
    }
  }
}
