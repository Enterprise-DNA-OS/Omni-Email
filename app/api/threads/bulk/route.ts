import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveThreadRemote, deleteThreadRemote } from "@/lib/email/outbound";
import { logAuditEvent } from "@/lib/audit/log";

type BulkAction = "archive" | "delete" | "mark_read" | "mark_unread" | "add_tag" | "remove_tag";

interface BulkRequestBody {
  threadIds: unknown;
  action: unknown;
  params?: { tagId?: string };
}

const VALID_ACTIONS: BulkAction[] = [
  "archive",
  "delete",
  "mark_read",
  "mark_unread",
  "add_tag",
  "remove_tag",
];

/**
 * POST /api/threads/bulk
 *
 * Execute a bulk action across multiple threads.
 *
 * Body:
 *   {
 *     threadIds: string[],
 *     action: 'archive' | 'delete' | 'mark_read' | 'mark_unread' | 'add_tag' | 'remove_tag',
 *     params?: { tagId?: string }
 *   }
 *
 * Returns:
 *   { success: true, processed: number, errors: string[] }
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BulkRequestBody;
  try {
    body = (await request.json()) as BulkRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { threadIds, action, params } = body;

  // Validate action
  if (typeof action !== "string" || !VALID_ACTIONS.includes(action as BulkAction)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  // Validate threadIds
  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return NextResponse.json({ error: "threadIds must be a non-empty array" }, { status: 400 });
  }

  if (threadIds.length > 100) {
    return NextResponse.json({ error: "Cannot process more than 100 threads at once" }, { status: 400 });
  }

  const typedAction = action as BulkAction;
  const typedThreadIds = threadIds as string[];

  // Validate tagId is present for tag actions
  if ((typedAction === "add_tag" || typedAction === "remove_tag") && !params?.tagId) {
    return NextResponse.json({ error: "params.tagId is required for tag actions" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify all threadIds belong to the authenticated user
  const { data: ownedThreads, error: ownerErr } = await admin
    .from("threads")
    .select("id")
    .in("id", typedThreadIds)
    .eq("user_id", user.id);

  if (ownerErr) {
    return NextResponse.json({ error: "Failed to verify thread ownership" }, { status: 500 });
  }

  const ownedIds = new Set((ownedThreads ?? []).map((t) => t.id as string));
  const unauthorizedIds = typedThreadIds.filter((id) => !ownedIds.has(id));

  if (unauthorizedIds.length > 0) {
    return NextResponse.json(
      { error: `Threads not found or not owned by user: ${unauthorizedIds.join(", ")}` },
      { status: 403 },
    );
  }

  // For add_tag: verify the tag belongs to the user
  if (typedAction === "add_tag" && params?.tagId) {
    const { data: tag } = await admin
      .from("tags")
      .select("id")
      .eq("id", params.tagId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
  }

  const errors: string[] = [];
  let processed = 0;

  // Execute the action for each thread
  for (const threadId of typedThreadIds) {
    try {
      switch (typedAction) {
        case "archive": {
          await archiveThreadRemote({ threadId, userId: user.id });
          await admin
            .from("threads")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", threadId)
            .eq("user_id", user.id);
          break;
        }

        case "delete": {
          // Always set deleted_at first so the thread hides immediately,
          // even if the remote provider delete fails
          const now = new Date();
          const hardDeleteAfter = new Date(now);
          hardDeleteAfter.setDate(hardDeleteAfter.getDate() + 30);
          await admin
            .from("threads")
            .update({
              deleted_at: now.toISOString(),
              hard_delete_after: hardDeleteAfter.toISOString(),
            })
            .eq("id", threadId)
            .eq("user_id", user.id);

          // Attempt remote delete — non-fatal if it fails
          try {
            await deleteThreadRemote({ threadId, userId: user.id });
          } catch (remoteErr) {
            // Log but don't fail — thread is already hidden locally.
            // The sync guard (deleted_at check) prevents resurrection.
            console.warn(
              `Remote delete failed for thread ${threadId}: ${remoteErr instanceof Error ? remoteErr.message : "unknown"}`,
            );
          }
          break;
        }

        case "mark_read": {
          await admin
            .from("messages")
            .update({ is_read: true })
            .eq("thread_id", threadId)
            .eq("is_read", false);
          break;
        }

        case "mark_unread": {
          // Mark only the most recent message as unread
          const { data: latest } = await admin
            .from("messages")
            .select("id")
            .eq("thread_id", threadId)
            .order("message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latest) {
            await admin.from("messages").update({ is_read: false }).eq("id", latest.id);
          }
          break;
        }

        case "add_tag": {
          // Upsert to avoid duplicate errors
          await admin
            .from("thread_tags")
            .upsert(
              { thread_id: threadId, tag_id: params!.tagId! },
              { onConflict: "thread_id,tag_id" },
            );
          break;
        }

        case "remove_tag": {
          await admin
            .from("thread_tags")
            .delete()
            .eq("thread_id", threadId)
            .eq("tag_id", params!.tagId!);
          break;
        }
      }

      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      errors.push(`Thread ${threadId}: ${msg}`);
    }
  }

  // Log the bulk action as a single audit entry
  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: `bulk.${typedAction}`,
    targetType: "threads",
    targetId: undefined,
    details: {
      threadIds: typedThreadIds,
      processed,
      errors: errors.length,
      ...(params?.tagId ? { tagId: params.tagId } : {}),
    },
    reversible: typedAction === "archive",
  }).catch(() => undefined);

  return NextResponse.json({ success: true, processed, errors });
}
