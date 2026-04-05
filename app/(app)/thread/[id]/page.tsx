import { notFound } from "next/navigation";
import { ThreadView } from "@/components/ThreadView";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

export default async function ThreadPage(props: PageProps) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Parallelize all read queries
  const [threadResult, messagesResult, threadTagsResult, allTagsResult, followUpResult] = await Promise.all([
    supabase
      .from("threads")
      .select("id, subject, ai_intent, ai_confidence, ai_reasoning, ai_signals, ai_category, is_newsletter, list_unsubscribe, primary_account_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, sender, body_html, body_text, message_at, labels, attachments")
      .eq("thread_id", id)
      .order("message_at", { ascending: true }),
    supabase
      .from("thread_tags")
      .select("tag_id, tags(id, name)")
      .eq("thread_id", id),
    supabase
      .from("tags")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("follow_ups")
      .select("sent_at")
      .eq("thread_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (threadResult.error || !threadResult.data) {
    notFound();
  }

  if (messagesResult.error) {
    console.error("Failed to load messages for thread", id, messagesResult.error);
  }

  // Fire-and-forget mark as read
  void supabase
    .from("messages")
    .update({ is_read: true })
    .eq("thread_id", id)
    .eq("is_read", false);

  // Extract tags from joined query
  const tags = (threadTagsResult.data ?? [])
    .map((r: Record<string, unknown>) => r.tags as { id: string; name: string } | null)
    .filter(Boolean) as { id: string; name: string }[];

  // Compute follow-up waiting days
  const followUpData = followUpResult.data;
  const followUp = followUpData
    ? {
        daysWaiting: Math.floor(
          (Date.now() - new Date(followUpData.sent_at as string).getTime()) / 86_400_000,
        ),
      }
    : null;

  // Extract sender email from earliest message
  const sortedMsgs = (messagesResult.data ?? []).sort(
    (a: { message_at: string }, b: { message_at: string }) => a.message_at.localeCompare(b.message_at),
  );
  const firstSender = (sortedMsgs[0]?.sender as string) ?? null;
  // Parse "Name <email>" format
  const senderEmailMatch = firstSender?.match(/<([^>]+)>/)?.[1] ?? firstSender;
  const senderDomain = senderEmailMatch?.includes("@") ? senderEmailMatch.split("@")[1] : null;

  const rawSignals = threadResult.data.ai_signals;
  const aiSignals = Array.isArray(rawSignals)
    ? (rawSignals as Array<{ signal: "risk" | "opportunity"; severity: "high" | "medium" | "low"; reason: string | null }>)
    : undefined;

  return (
    <ThreadView
      threadId={id}
      subject={threadResult.data.subject as string | null}
      primaryAccountId={(threadResult.data.primary_account_id as string) ?? null}
      aiIntent={(threadResult.data.ai_intent as string) ?? null}
      aiConfidence={(threadResult.data.ai_confidence as number) ?? null}
      aiReasoning={(threadResult.data.ai_reasoning as string) ?? null}
      aiCategory={(threadResult.data.ai_category as string) ?? null}
      senderEmail={senderEmailMatch ?? null}
      senderDomain={senderDomain}
      isNewsletter={(threadResult.data.is_newsletter as boolean) ?? null}
      listUnsubscribe={(threadResult.data.list_unsubscribe as string) ?? null}
      followUp={followUp}
      aiSignals={aiSignals}
      messages={messagesResult.data ?? []}
      tags={tags}
      allTags={(allTagsResult.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
    />
  );
}
