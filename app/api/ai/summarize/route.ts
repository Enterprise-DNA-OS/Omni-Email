import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let threadId = "";
  try {
    const body = (await request.json()) as { threadId?: string };
    threadId = body.threadId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  const { data: thread } = await supabase
    .from("threads")
    .select("id, subject")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("sender, body_html, body_text, message_at")
    .eq("thread_id", threadId)
    .order("message_at", { ascending: true });

  const formattedMessages = (messages ?? []).map((m) => ({
    sender: (m.sender as string) ?? "Unknown",
    body: (
      (m.body_text as string) ||
      (m.body_html ? stripHtml(m.body_html as string) : "")
    ).slice(0, 2000),
    date: new Date(m.message_at as string).toLocaleString(),
  }));

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-summarize`, {
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
      return NextResponse.json(
        { error: "AI rate limit reached — please try again shortly" },
        { status: 429 },
      );
    }
    if (!efRes.ok) {
      const text = await efRes.text();
      return NextResponse.json(
        { error: `AI service error (${efRes.status}): ${text}` },
        { status: 500 },
      );
    }

    const { summary } = (await efRes.json()) as { summary: string };
    return NextResponse.json({ summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
