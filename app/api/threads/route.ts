import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const accountId = url.searchParams.get("accountId");
  const tagId = url.searchParams.get("tagId");
  const q = url.searchParams.get("q");
  const showSnoozed = url.searchParams.get("snoozed") === "true";
  const showTrash = url.searchParams.get("trash") === "true";

  let threadIds: string[] | null = null;
  if (tagId) {
    const { data: tt } = await supabase.from("thread_tags").select("thread_id").eq("tag_id", tagId);
    threadIds = (tt ?? []).map((r) => r.thread_id as string);
    if (threadIds.length === 0) {
      return NextResponse.json({ threads: [], nextOffset: offset });
    }
  }

  let query = supabase
    .from("threads")
    .select("id, subject, snippet, last_message_at, primary_account_id, sender_name, sender_email, ai_summary, ai_category, ai_priority, ai_tags, ai_intent, ai_confidence, ai_reasoning, snoozed_until, deleted_at")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .range(offset, offset + 24);

  if (showTrash) {
    // Trash view: only soft-deleted threads
    query = query.not("deleted_at", "is", null);
  } else {
    // Normal views: exclude soft-deleted threads
    query = query.is("deleted_at", null).is("archived_at", null);
  }

  // By default exclude snoozed threads; pass ?snoozed=true to show only snoozed threads
  if (!showTrash) {
    if (showSnoozed) {
      query = query.not("snoozed_until", "is", null);
    } else {
      query = query.is("snoozed_until", null);
    }
  }

  if (accountId) {
    query = query.eq("primary_account_id", accountId);
  }
  if (threadIds) {
    query = query.in("id", threadIds);
  }
  if (q && q.trim()) {
    query = query.textSearch("search_vector", q.trim(), {
      type: "websearch",
      config: "english",
    });
  }

  const { data: threadsRaw, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = threadsRaw ?? [];
  const accountIds = [...new Set(rows.map((r) => r.primary_account_id).filter(Boolean))] as string[];
  let accountMap: Record<string, { provider: string; email_address: string }> = {};
  if (accountIds.length > 0) {
    const { data: accs } = await supabase
      .from("accounts")
      .select("id, provider, email_address")
      .in("id", accountIds);
    accountMap = Object.fromEntries(
      (accs ?? []).map((a) => [
        a.id as string,
        { provider: a.provider as string, email_address: a.email_address as string },
      ]),
    );
  }

  // Fetch sender + unread + attachment info in one query
  const rowIds = rows.map((r) => r.id as string);
  const senderMap: Record<string, string> = {};
  const unreadSet = new Set<string>();
  const hasAttachmentsSet = new Set<string>();
  if (rowIds.length > 0) {
    const { data: msgInfo } = await supabase
      .from("messages")
      .select("thread_id, sender, is_read, message_at, attachments")
      .in("thread_id", rowIds)
      .order("message_at", { ascending: true });
    for (const m of msgInfo ?? []) {
      const tid = m.thread_id as string;
      // Use earliest message sender (thread originator, not user's own reply)
      if (!senderMap[tid]) {
        senderMap[tid] = m.sender as string;
      }
      if (!(m.is_read as boolean)) {
        unreadSet.add(tid);
      }
      const atts = m.attachments as unknown[];
      if (Array.isArray(atts) && atts.length > 0) {
        hasAttachmentsSet.add(tid);
      }
    }
  }

  const threads = rows.map((r) => {
    const pa = r.primary_account_id as string | null;
    const acc = pa ? accountMap[pa] : undefined;
    return {
      id: r.id,
      subject: r.subject,
      snippet: r.snippet,
      lastMessageAt: r.last_message_at,
      primaryAccountId: r.primary_account_id,
      sender: senderMap[r.id as string] ?? null,
      senderName: r.sender_name ?? null,
      senderEmail: r.sender_email ?? null,
      account: acc
        ? { provider: acc.provider, emailAddress: acc.email_address }
        : null,
      hasUnread: unreadSet.has(r.id as string),
      hasAttachments: hasAttachmentsSet.has(r.id as string),
      snoozedUntil: r.snoozed_until ?? null,
      aiSummary: r.ai_summary ?? null,
      aiCategory: r.ai_category ?? null,
      aiPriority: r.ai_priority ?? null,
      aiTags: (r.ai_tags as string[]) ?? [],
      aiIntent: (r.ai_intent as string) ?? null,
      aiConfidence: (r.ai_confidence as number) ?? null,
      aiReasoning: (r.ai_reasoning as string) ?? null,
      deletedAt: (r.deleted_at as string | null) ?? null,
    };
  });

  return NextResponse.json({
    threads,
    nextOffset: offset + threads.length,
  });
}
