import { InboxView } from "@/components/InboxView";
import { SmartSetupBanner } from "@/components/SmartSetupBanner";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  accountId?: string;
  tagId?: string;
  q?: string;
}>;

export default async function InboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const accountId = resolvedSearchParams.accountId?.trim() ?? "";
  const tagId = resolvedSearchParams.tagId?.trim() ?? "";
  const q = resolvedSearchParams.q?.trim() ?? "";

  let tagThreadIds: string[] | null = null;
  if (tagId) {
    const { data: threadTags } = await supabase
      .from("thread_tags")
      .select("thread_id")
      .eq("tag_id", tagId);
    tagThreadIds = (threadTags ?? []).map((row) => row.thread_id as string);
  }

  let threadsQuery = supabase
    .from("threads")
    .select("id, subject, snippet, last_message_at, primary_account_id, sender_name, sender_email, ai_summary, ai_category, ai_priority, ai_tags, ai_intent, ai_confidence, ai_reasoning")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .range(0, 24);

  if (accountId) {
    threadsQuery = threadsQuery.eq("primary_account_id", accountId);
  }
  if (tagThreadIds) {
    if (tagThreadIds.length === 0) {
      threadsQuery = threadsQuery.in("id", [""]);
    } else {
      threadsQuery = threadsQuery.in("id", tagThreadIds);
    }
  }
  if (q) {
    threadsQuery = threadsQuery.textSearch("search_vector", q, {
      type: "websearch",
      config: "english",
    });
  }

  const [{ data: threads }, { data: accounts }, { data: tags }] = await Promise.all([
    threadsQuery,
    supabase
      .from("accounts")
      .select("id, provider, email_address")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("tags").select("id, name").eq("user_id", user.id).order("name"),
  ]);

  const accIds = [...new Set((threads ?? []).map((t) => t.primary_account_id).filter(Boolean))] as string[];
  let accountMap: Record<string, { provider: string; email_address: string }> = {};
  if (accIds.length > 0) {
    const { data: accRows } = await supabase
      .from("accounts")
      .select("id, provider, email_address")
      .in("id", accIds);
    accountMap = Object.fromEntries(
      (accRows ?? []).map((a) => [
        a.id as string,
        { provider: a.provider as string, email_address: a.email_address as string },
      ]),
    );
  }

  // Fetch sender + unread + attachments + drafts for initial threads
  const inboxThreadIds = (threads ?? []).map((t) => t.id as string);
  const senderMap: Record<string, string> = {};
  const unreadSet = new Set<string>();
  const hasAttachmentsSet = new Set<string>();
  const hasDraftSet = new Set<string>();
  if (inboxThreadIds.length > 0) {
    const [{ data: msgInfo }, { data: draftInfo }] = await Promise.all([
      supabase
        .from("messages")
        .select("thread_id, sender, is_read, message_at, attachments")
        .in("thread_id", inboxThreadIds)
        .order("message_at", { ascending: true }),
      supabase
        .from("messages")
        .select("thread_id")
        .in("thread_id", inboxThreadIds)
        .contains("labels", ["DRAFT"]),
    ]);
    for (const m of msgInfo ?? []) {
      const tid = m.thread_id as string;
      // Use the earliest message's sender (the person who started the thread),
      // not the latest (which is often the user's own reply).
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
    for (const d of draftInfo ?? []) {
      hasDraftSet.add(d.thread_id as string);
    }
  }

  const initialThreads = (threads ?? []).map((t) => {
    const pa = t.primary_account_id as string | null;
    const acc = pa ? accountMap[pa] : undefined;
    return {
      id: t.id as string,
      subject: t.subject as string | null,
      snippet: t.snippet as string | null,
      lastMessageAt: t.last_message_at as string | null,
      sender: senderMap[t.id as string] ?? null,
      senderName: (t.sender_name as string) ?? null,
      senderEmail: (t.sender_email as string) ?? null,
      account: acc ? { provider: acc.provider, emailAddress: acc.email_address } : null,
      hasUnread: unreadSet.has(t.id as string),
      hasAttachments: hasAttachmentsSet.has(t.id as string),
      hasDraft: hasDraftSet.has(t.id as string),
      aiSummary: (t.ai_summary as string) ?? null,
      aiCategory: (t.ai_category as string) ?? null,
      aiPriority: (t.ai_priority as string) ?? null,
      aiTags: (t.ai_tags as string[]) ?? [],
      aiIntent: (t.ai_intent as string) ?? null,
      aiConfidence: (t.ai_confidence as number) ?? null,
      aiReasoning: (t.ai_reasoning as string) ?? null,
    };
  });

  const accOptions = (accounts ?? []).map((a) => ({
    id: a.id as string,
    provider: a.provider as string,
    emailAddress: a.email_address as string,
  }));

  const tagOptions = (tags ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
  }));

  return (
    <div className="p-6 lg:p-8">
      <SmartSetupBanner />
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Inbox</h1>
        <p className="mt-1 text-sm text-text-muted">Your unified email inbox across all accounts.</p>
      </div>
      <InboxView
        initialThreads={initialThreads}
        initialFilters={{ accountId, tagId, q }}
        accounts={accOptions}
        tags={tagOptions}
      />
    </div>
  );
}
