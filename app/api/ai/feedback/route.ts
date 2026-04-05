import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let threadId: string | null = null;
  let feedbackType: string;
  let aiOutput: Record<string, unknown>;
  let userCorrection: Record<string, unknown>;

  try {
    const body = (await request.json()) as {
      threadId?: string | null;
      feedbackType?: string;
      aiOutput?: Record<string, unknown>;
      userCorrection?: Record<string, unknown>;
    };
    threadId = body.threadId ?? null;
    feedbackType = body.feedbackType ?? "";
    aiOutput = body.aiOutput ?? {};
    userCorrection = body.userCorrection ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["classification", "draft", "action"].includes(feedbackType)) {
    return NextResponse.json(
      { error: "feedbackType must be one of: classification, draft, action" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_feedback")
    .insert({
      user_id: user.id,
      thread_id: threadId || null,
      feedback_type: feedbackType,
      ai_output: aiOutput,
      user_correction: userCorrection,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const feedbackType = searchParams.get("feedbackType");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  let query = supabase
    .from("ai_feedback")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (threadId) {
    query = query.eq("thread_id", threadId);
  }
  if (feedbackType) {
    query = query.eq("feedback_type", feedbackType);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }

  return NextResponse.json({ feedback: data });
}
