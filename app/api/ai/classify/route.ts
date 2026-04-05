import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface ClassifyResult {
  summary: string;
  category: string;
  priority: "urgent" | "high" | "normal" | "low" | "ignore";
  tags: string[];
  intent: string;
  confidence: number;
  reasoning: string;
  signals: string[];
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let threadIds: string[] = [];
  let limit = 10;
  try {
    const body = (await request.json()) as { threadIds?: string[]; limit?: number };
    threadIds = body.threadIds ?? [];
    limit = body.limit ?? 10;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();

  // If no specific threadIds, find unprocessed threads for this user
  if (threadIds.length === 0) {
    const { data: unprocessed } = await supabase
      .from("threads")
      .select("id")
      .eq("user_id", user.id)
      .is("ai_processed_at", null)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false })
      .limit(limit);
    threadIds = (unprocessed ?? []).map((t) => t.id as string);
  }

  if (threadIds.length === 0) {
    return NextResponse.json({ processed: 0, results: [] });
  }

  const results: { threadId: string; classification: ClassifyResult }[] = [];
  const errors: { threadId: string; error: string }[] = [];

  for (const threadId of threadIds) {
    try {
      // Verify the thread belongs to this user
      const { data: thread } = await supabase
        .from("threads")
        .select("id, subject")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!thread) continue;

      const { data: messages } = await supabase
        .from("messages")
        .select("sender, body_html, body_text, message_at")
        .eq("thread_id", threadId)
        .order("message_at", { ascending: true })
        .limit(10);

      const formattedMessages = (messages ?? []).map((m) => ({
        sender: (m.sender as string) ?? "Unknown",
        body: (
          (m.body_text as string) ||
          (m.body_html ? stripHtml(m.body_html as string) : "")
        ).slice(0, 1500),
      }));

      // Call the edge function
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Supabase env vars are not set");
      }
      const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-classify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          subject: (thread.subject as string) ?? "(no subject)",
          messages: formattedMessages,
        }),
      });

      if (efRes.status === 429) {
        throw new Error("AI rate limit reached — please try again shortly");
      }
      if (!efRes.ok) {
        const text = await efRes.text();
        throw new Error(`AI service error (${efRes.status}): ${text}`);
      }

      const classification = (await efRes.json()) as ClassifyResult;

      // Persist AI results to the database
      await admin
        .from("threads")
        .update({
          ai_summary: classification.summary,
          ai_category: classification.category,
          ai_priority: classification.priority,
          ai_tags: classification.tags,
          ai_intent: classification.intent,
          ai_confidence: classification.confidence,
          ai_reasoning: classification.reasoning,
          ai_signals: classification.signals || [],
          ai_processed_at: new Date().toISOString(),
        })
        .eq("id", threadId);

      // Auto-create and assign tags
      for (const tagName of classification.tags) {
        const { data: existingTag } = await admin
          .from("tags")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", tagName)
          .maybeSingle();

        let tagId: string;
        if (existingTag) {
          tagId = existingTag.id as string;
        } else {
          const { data: newTag, error: tagErr } = await admin
            .from("tags")
            .insert({ user_id: user.id, name: tagName })
            .select("id")
            .single();
          if (tagErr || !newTag) continue;
          tagId = newTag.id as string;
        }

        await admin
          .from("thread_tags")
          .upsert(
            { thread_id: threadId, tag_id: tagId },
            { onConflict: "thread_id,tag_id" },
          );
      }

      results.push({ threadId, classification });
    } catch (e) {
      errors.push({
        threadId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    errors: errors.length > 0 ? errors : undefined,
    results,
  });
}
