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
  const status = url.searchParams.get("status") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("cold_email_log")
    .select("id, thread_id, sender_email, sender_domain, confidence, reasoning, action_taken, is_false_positive, detected_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("detected_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === "blocked") {
    query = query.in("action_taken", ["labeled", "archived"]);
  } else if (status === "false_positive") {
    query = query.eq("is_false_positive", true);
  }

  const { data: logs, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = logs ?? [];

  // Hydrate thread subject + snippet
  const threadIds = [...new Set(rows.map((r) => r.thread_id as string))];
  let threadMap: Record<string, { subject: string; snippet: string }> = {};
  if (threadIds.length > 0) {
    const { data: threads } = await supabase
      .from("threads")
      .select("id, subject, snippet")
      .in("id", threadIds);
    threadMap = Object.fromEntries(
      (threads ?? []).map((t) => [
        t.id as string,
        { subject: (t.subject as string) ?? "", snippet: (t.snippet as string) ?? "" },
      ]),
    );
  }

  const coldEmails = rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id,
    senderEmail: r.sender_email,
    senderDomain: r.sender_domain ?? null,
    confidence: r.confidence,
    reasoning: r.reasoning ?? null,
    actionTaken: r.action_taken ?? "none",
    isFalsePositive: r.is_false_positive ?? false,
    detectedAt: r.detected_at,
    thread: threadMap[r.thread_id as string] ?? { subject: "", snippet: "" },
  }));

  return NextResponse.json({
    coldEmails,
    total: count ?? 0,
    page,
    limit,
  });
}
