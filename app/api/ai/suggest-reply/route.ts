import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/ai/client";
import { REPLY_MODE_PROMPTS, type ReplyMode } from "@/lib/ai/reply-modes";
import { getStyleContext } from "@/lib/ai/tone-learning";
import { generateContextAwareDraft } from "@/lib/ai/context-aware-drafts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const VALID_TONES = Object.keys(REPLY_MODE_PROMPTS) as ReplyMode[];

type Tone = ReplyMode;

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
  let tone: Tone = "professional";
  let customInstruction: string | undefined;
  let contextAware = false;
  try {
    const body = (await request.json()) as {
      threadId?: string;
      tone?: string;
      customInstruction?: string;
      contextAware?: boolean;
    };
    threadId = body.threadId ?? "";
    if (body.tone && (VALID_TONES as string[]).includes(body.tone)) {
      tone = body.tone as Tone;
    }
    if (body.customInstruction && typeof body.customInstruction === "string") {
      customInstruction = body.customInstruction.trim().slice(0, 500) || undefined;
    }
    if (typeof body.contextAware === "boolean") {
      contextAware = body.contextAware;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  const { data: thread } = await supabase
    .from("threads")
    .select("id, subject, primary_account_id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const primaryAccountId = (thread.primary_account_id as string | null) ?? null;

  // --- Context-aware path ---
  if (contextAware && primaryAccountId) {
    try {
      const result = await generateContextAwareDraft(threadId, primaryAccountId, user.id);
      return NextResponse.json({
        reply: result.draft,
        suggestedNextSteps: result.suggestedNextSteps,
        contextAware: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI error";
      if (msg.includes("rate limit")) {
        return NextResponse.json({ error: msg }, { status: 429 });
      }
      // Fall through to standard path on context-draft failure
      console.error("suggest-reply: context-aware draft failed, falling back:", msg);
    }
  }

  // --- Standard path ---

  // Load the writing style profile for the sending account (non-fatal if missing)
  let writingStyleProfile: string | null = null;
  if (primaryAccountId) {
    writingStyleProfile = await getStyleContext(primaryAccountId).catch(() => null);
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
  }));

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-suggest-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        subject: (thread.subject as string) ?? "(no subject)",
        messages: formattedMessages,
        tone,
        ...(customInstruction ? { customInstruction } : {}),
        ...(writingStyleProfile ? { writingStyleProfile } : {}),
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

    const { reply } = (await efRes.json()) as { reply: string };
    return NextResponse.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
