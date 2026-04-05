import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLogEntry } from "@/lib/audit/log";
import { unarchiveThread, reAddTag, removeTag, restoreDeletedThread } from "@/lib/undo/reversals";

/**
 * Stamp the audit log entry as undone.
 * Called after successful reversal so the record reflects the undo.
 */
async function markUndone(auditLogId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("audit_log")
    .update({ undone_at: new Date().toISOString() })
    .eq("id", auditLogId);
}

/**
 * Execute the reversal for a given audit log entry, then mark it as undone.
 *
 * Supported actions:
 *   thread.archive  → unarchiveThread
 *   thread.tag.add  → removeTag  (undo add = remove)
 *   thread.tag.remove → reAddTag (undo remove = add back)
 *   thread.delete   → restoreDeletedThread (Gmail only)
 *
 * Throws a descriptive error for unknown or unsupported actions.
 * Throws if the entry has already been undone.
 */
export async function executeUndo(entry: AuditLogEntry): Promise<void> {
  if (entry.undone_at) {
    throw new Error("This action has already been undone.");
  }

  if (!entry.reversible) {
    throw new Error("This action is not marked as reversible.");
  }

  const threadId = entry.target_id;
  if (!threadId) {
    throw new Error(`Audit entry ${entry.id} has no target_id — cannot undo.`);
  }

  const userId = entry.user_id;

  switch (entry.action) {
    case "thread.archive": {
      await unarchiveThread(threadId, userId);
      break;
    }

    case "thread.tag.add": {
      // Undoing a "tag add" means removing the tag
      const tagId = entry.details.tagId as string | undefined;
      if (!tagId) {
        throw new Error("audit entry details.tagId is missing — cannot undo tag.add.");
      }
      await removeTag(threadId, tagId, userId);
      break;
    }

    case "thread.tag.remove": {
      // Undoing a "tag remove" means re-adding the tag
      const tagId = entry.details.tagId as string | undefined;
      if (!tagId) {
        throw new Error("audit entry details.tagId is missing — cannot undo tag.remove.");
      }
      await reAddTag(threadId, tagId, userId);
      break;
    }

    case "thread.delete": {
      await restoreDeletedThread(threadId, userId);
      break;
    }

    default: {
      throw new Error(
        `Action "${entry.action}" does not have a registered reversal. Undo is not supported.`,
      );
    }
  }

  // Only stamp undone_at after the reversal succeeded
  await markUndone(entry.id);
}
