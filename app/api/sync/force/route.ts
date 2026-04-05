import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncEmailAccount } from "@/lib/email/sync";

export const maxDuration = 120;

/**
 * POST /api/sync/force
 * Resets sync_state on all user accounts and re-syncs from scratch.
 * This re-fetches the last 7 days of messages with full bodies.
 */
export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get all user accounts
  const { data: accounts, error: accErr } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);
  if (accErr) {
    return NextResponse.json({ error: accErr.message }, { status: 500 });
  }

  // Reset sync_state so the next sync fetches last 7 days from scratch
  const ids = (accounts ?? []).map((a) => a.id as string);
  if (ids.length > 0) {
    await admin
      .from("accounts")
      .update({ sync_state: {} })
      .in("id", ids);
  }

  // Sync each account
  const synced: string[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const id of ids) {
    try {
      await syncEmailAccount(id);
      synced.push(id);
    } catch (e) {
      errors.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Fix thread sender fields from the earliest message in each thread
  const { data: userThreads } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", user.id);
  let sendersFixed = 0;
  for (const t of userThreads ?? []) {
    const { data: earliest } = await admin
      .from("messages")
      .select("sender")
      .eq("thread_id", t.id as string)
      .order("message_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (earliest?.sender) {
      const raw = earliest.sender as string;
      const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
      const senderName = match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
      const senderEmail = match ? match[2].trim() : raw.includes("@") ? raw.trim() : null;
      await admin
        .from("threads")
        .update({ sender_name: senderName, sender_email: senderEmail })
        .eq("id", t.id as string);
      sendersFixed++;
    }
  }

  return NextResponse.json({ synced, errors, sendersFixed });
}
