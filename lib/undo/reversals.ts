import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/email/sync";

type Provider = "gmail" | "outlook";

/**
 * Fetch the messages and their associated account/provider info for a thread.
 * Used by both unarchive and restore-from-trash operations.
 */
async function getThreadMessages(
  threadId: string,
): Promise<{ accId: string; mid: string; prov: Provider; token: string }[]> {
  const admin = createAdminClient();
  const { data: msgs } = await admin
    .from("messages")
    .select("account_id, provider_message_id")
    .eq("thread_id", threadId);

  if (!msgs?.length) return [];

  const accIds = [...new Set(msgs.map((m) => m.account_id as string))];
  const { data: accRows } = await admin
    .from("accounts")
    .select("id, provider")
    .in("id", accIds);

  const provMap = Object.fromEntries(
    (accRows ?? []).map((a) => [a.id as string, a.provider as Provider]),
  );

  const results: { accId: string; mid: string; prov: Provider; token: string }[] = [];
  for (const m of msgs) {
    const accId = m.account_id as string;
    const prov = provMap[accId];
    if (!prov) continue;
    const token = await getValidAccessToken(accId);
    results.push({ accId, mid: m.provider_message_id as string, prov, token });
  }
  return results;
}

/**
 * Reverse a `thread.archive` action.
 * - Sets `archived_at = null` in the database.
 * - For Gmail: adds the INBOX label back to each message.
 * - For Outlook: moves each message back to the inbox folder.
 */
export async function unarchiveThread(threadId: string, userId: string): Promise<void> {
  const admin = createAdminClient();

  // Verify thread ownership
  const { data: th } = await admin
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!th) throw new Error("Thread not found");

  // Clear archived_at in the database first
  await admin
    .from("threads")
    .update({ archived_at: null })
    .eq("id", threadId)
    .eq("user_id", userId);

  // Move each message back to inbox at the provider level
  const messages = await getThreadMessages(threadId);
  for (const { mid, prov, token } of messages) {
    if (prov === "gmail") {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}/modify`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ addLabelIds: ["INBOX"] }),
        },
      );
      if (!res.ok) {
        throw new Error(`Gmail unarchive failed: ${await res.text()}`);
      }
    } else {
      // Outlook: move to the inbox folder
      const folderRes = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!folderRes.ok) {
        throw new Error(`Graph inbox folder lookup failed: ${await folderRes.text()}`);
      }
      const fj = (await folderRes.json()) as { id?: string };
      if (!fj.id) throw new Error("No inbox folder id returned");

      const mv = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${mid}/move`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: fj.id }),
      });
      if (!mv.ok) {
        throw new Error(`Graph move to inbox failed: ${await mv.text()}`);
      }
    }
  }
}

/**
 * Reverse a `thread.tag.remove` action — re-inserts the tag association.
 * Uses INSERT … ON CONFLICT DO NOTHING to be safe if the row already exists.
 */
export async function reAddTag(threadId: string, tagId: string, userId: string): Promise<void> {
  const admin = createAdminClient();

  // Verify thread ownership
  const { data: th } = await admin
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!th) throw new Error("Thread not found");

  // Verify tag ownership
  const { data: tag } = await admin
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!tag) throw new Error("Tag not found");

  const { error } = await admin
    .from("thread_tags")
    .upsert({ thread_id: threadId, tag_id: tagId }, { onConflict: "thread_id,tag_id", ignoreDuplicates: true });
  if (error) throw new Error(`Failed to re-add tag: ${error.message}`);
}

/**
 * Reverse a `thread.tag.add` action — removes the tag association.
 */
export async function removeTag(threadId: string, tagId: string, userId: string): Promise<void> {
  const admin = createAdminClient();

  // Verify thread ownership
  const { data: th } = await admin
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!th) throw new Error("Thread not found");

  const { error } = await admin
    .from("thread_tags")
    .delete()
    .eq("thread_id", threadId)
    .eq("tag_id", tagId);
  if (error) throw new Error(`Failed to remove tag: ${error.message}`);
}

/**
 * Attempt to restore a deleted thread from the provider trash.
 * - Gmail: untrashes each message.
 * - Outlook: the thread was hard-deleted from Graph so restore is not supported.
 *
 * Note: the thread DB row was deleted, so local records cannot be restored here.
 * Provider-side restore works for Gmail only; Outlook will throw a descriptive error.
 */
export async function restoreDeletedThread(threadId: string, userId: string): Promise<void> {
  const admin = createAdminClient();

  // The thread row itself has been deleted; we can only check messages
  const { data: msgs } = await admin
    .from("messages")
    .select("account_id, provider_message_id")
    .eq("thread_id", threadId);

  if (!msgs?.length) {
    // Messages were also deleted — nothing to restore
    throw new Error(
      "Thread was permanently deleted from the database. Restoration is not possible.",
    );
  }

  const accIds = [...new Set(msgs.map((m) => m.account_id as string))];
  const { data: accRows } = await admin
    .from("accounts")
    .select("id, provider")
    .in("id", accIds);

  const provMap = Object.fromEntries(
    (accRows ?? []).map((a) => [a.id as string, a.provider as Provider]),
  );

  // Check if any account is Outlook — we can't restore there
  const providers = new Set(Object.values(provMap));
  if (providers.has("outlook")) {
    throw new Error(
      "Thread deletion cannot be undone for Outlook accounts. Messages were permanently deleted via Graph API.",
    );
  }

  for (const m of msgs) {
    const accId = m.account_id as string;
    const prov = provMap[accId];
    if (!prov) continue;
    const token = await getValidAccessToken(accId);
    const mid = m.provider_message_id as string;
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}/untrash`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      throw new Error(`Gmail untrash failed: ${await res.text()}`);
    }
  }
}
