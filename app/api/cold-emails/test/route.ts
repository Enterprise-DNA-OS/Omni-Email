import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface AiColdEmailResult {
  isColdEmail: boolean;
  confidence: number;
  reasoning: string;
  signals: string[];
  error?: string;
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

  let body: { threadId: string };
  try {
    body = (await request.json()) as { threadId: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  // Fetch thread + first message
  const { data: thread, error: threadErr } = await supabase
    .from("threads")
    .select("id, subject, snippet, sender_email, user_id")
    .eq("id", body.threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("body_html, body_text, sender")
    .eq("thread_id", body.threadId)
    .order("message_at", { ascending: true })
    .limit(1);

  const firstMessage = messages?.[0];
  const rawBody = (firstMessage?.body_html as string | null) ?? (firstMessage?.body_text as string | null) ?? (thread.snippet as string) ?? "";
  const bodySnippet = stripHtml(rawBody).slice(0, 1200);
  const senderEmail = (thread.sender_email as string | null) ?? ((firstMessage?.sender as string | null) ?? "");

  // Count prior messages from this sender — messages have no user_id column,
  // so we scope to the user's thread IDs first.
  const { data: userThreadRows } = await supabase
    .from("threads")
    .select("id")
    .eq("user_id", user.id);

  const userThreadIds = (userThreadRows ?? []).map((t) => t.id as string);

  let senderHistory = 0;
  if (userThreadIds.length > 0) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", userThreadIds)
      .ilike("sender", `%${senderEmail}%`);
    senderHistory = count ?? 0;
  }

  // Fetch user's custom criteria
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("cold_email_custom_criteria")
    .eq("user_id", user.id)
    .maybeSingle();

  const customCriteria = (prefs?.cold_email_custom_criteria as string | null) ?? undefined;

  // Call edge function
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-cold-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      senderEmail,
      subject: (thread.subject as string) ?? "",
      bodySnippet,
      senderHistory: senderHistory ?? 0,
      customCriteria,
    }),
  });

  if (edgeRes.status === 429) {
    return NextResponse.json(
      { error: "AI rate limit reached — please try again shortly" },
      { status: 429 },
    );
  }
  if (!edgeRes.ok) {
    const text = await edgeRes.text();
    return NextResponse.json({ error: `AI service error: ${text}` }, { status: 500 });
  }

  const result = (await edgeRes.json()) as AiColdEmailResult;
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    threadId: body.threadId,
    senderEmail,
    senderHistory: senderHistory ?? 0,
    isColdEmail: result.isColdEmail,
    confidence: result.confidence,
    reasoning: result.reasoning,
    signals: result.signals,
  });
}
