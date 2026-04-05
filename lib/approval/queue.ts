import { createAdminClient } from "@/lib/supabase/admin";
import { archiveThreadRemote, deleteThreadRemote } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";

export interface ApprovalQueueEntry {
  id: string;
  user_id: string;
  thread_id: string;
  proposed_action: string;
  proposed_details: Record<string, unknown>;
  confidence: number;
  reasoning: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  resolved_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface EnqueueParams {
  userId: string;
  threadId: string;
  proposedAction: string;
  proposedDetails?: Record<string, unknown>;
  confidence: number;
  reasoning?: string;
}

/**
 * Insert a new pending item into the approval queue using the admin client.
 * Skips insertion if an identical pending entry already exists for the same
 * user + thread + action combination.
 */
export async function enqueueForApproval(params: EnqueueParams): Promise<ApprovalQueueEntry | null> {
  const admin = createAdminClient();

  // De-duplicate: skip if there is already a pending entry for the same action on this thread
  const { data: existing } = await admin
    .from("approval_queue")
    .select("id")
    .eq("user_id", params.userId)
    .eq("thread_id", params.threadId)
    .eq("proposed_action", params.proposedAction)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return null;
  }

  const { data, error } = await admin
    .from("approval_queue")
    .insert({
      user_id: params.userId,
      thread_id: params.threadId,
      proposed_action: params.proposedAction,
      proposed_details: params.proposedDetails ?? {},
      confidence: params.confidence,
      reasoning: params.reasoning ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`approval_queue insert failed: ${error.message}`);
  }

  return data as ApprovalQueueEntry;
}

/**
 * Execute the action described by a queue entry.
 * Supported actions: archive, delete, label, unsubscribe.
 * After execution, writes an audit log entry with actor 'system'.
 */
export async function executeApprovedAction(entry: ApprovalQueueEntry): Promise<void> {
  const admin = createAdminClient();

  switch (entry.proposed_action) {
    case "archive": {
      // Archive via provider API
      await archiveThreadRemote({ threadId: entry.thread_id, userId: entry.user_id });

      // Set archived_at in database
      await admin
        .from("threads")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", entry.thread_id)
        .eq("user_id", entry.user_id);

      break;
    }

    case "delete": {
      // Trash/delete via provider API
      await deleteThreadRemote({ threadId: entry.thread_id, userId: entry.user_id });

      // Remove thread record
      await admin
        .from("threads")
        .delete()
        .eq("id", entry.thread_id)
        .eq("user_id", entry.user_id);

      break;
    }

    case "label": {
      const tagId = entry.proposed_details.tagId as string | undefined;
      if (!tagId) {
        throw new Error("label action requires proposed_details.tagId");
      }

      await admin
        .from("thread_tags")
        .upsert(
          { thread_id: entry.thread_id, tag_id: tagId },
          { onConflict: "thread_id,tag_id" },
        );

      break;
    }

    case "unsubscribe": {
      // Placeholder — unsubscribe flow will be wired in a future iteration
      break;
    }

    case "ignore": {
      // "ignore" means the AI recommends no action — approving it simply archives
      await admin
        .from("threads")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", entry.thread_id)
        .eq("user_id", entry.user_id);
      break;
    }

    case "forward":
    case "star":
    case "set_priority":
    case "auto_reply":
    case "move_to_approval":
    case "suppress_ai": {
      // These actions are informational — approving acknowledges the AI recommendation.
      // The actual execution is handled elsewhere or is a no-op in the approval context.
      break;
    }

    default:
      // Gracefully handle unknown actions instead of throwing
      console.warn(`approval_queue: unhandled proposed_action "${entry.proposed_action}" for entry ${entry.id}`);
      break;
  }

  // Audit the execution
  await logAuditEvent({
    userId: entry.user_id,
    actor: "system",
    action: `approval_queue.executed.${entry.proposed_action}`,
    targetType: "thread",
    targetId: entry.thread_id,
    details: {
      approval_queue_id: entry.id,
      proposed_details: entry.proposed_details,
      confidence: entry.confidence,
    },
    reversible: entry.proposed_action === "archive",
  });
}
