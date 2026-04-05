import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = ["pending", "done", "dismissed"] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];

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
  const statusParam = url.searchParams.get("status") ?? "pending";
  const threadId = url.searchParams.get("threadId");

  const status: TaskStatus = (VALID_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as TaskStatus)
    : "pending";

  let query = supabase
    .from("tasks")
    .select(
      "id, thread_id, message_id, description, deadline, assignee, status, source, created_at, completed_at",
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(100);

  if (threadId) {
    query = query.eq("thread_id", threadId);
  }

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: tasks ?? [] });
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

  let description = "";
  let threadId: string | null = null;
  let messageId: string | null = null;
  let deadline: string | null = null;
  let assignee: string | null = null;

  try {
    const body = (await request.json()) as {
      description?: string;
      threadId?: string;
      messageId?: string;
      deadline?: string;
      assignee?: string;
    };
    description = body.description?.trim() ?? "";
    threadId = body.threadId?.trim() || null;
    messageId = body.messageId?.trim() || null;
    deadline = body.deadline?.trim() || null;
    assignee = body.assignee?.trim() || null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  // Validate deadline is an ISO string if provided
  if (deadline && isNaN(Date.parse(deadline))) {
    return NextResponse.json(
      { error: "deadline must be a valid ISO 8601 date string" },
      { status: 400 },
    );
  }

  // Verify thread ownership if provided
  if (threadId) {
    const { data: thread } = await supabase
      .from("threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
  }

  const admin = createAdminClient();
  const { data: task, error: iErr } = await admin
    .from("tasks")
    .insert({
      user_id: user.id,
      thread_id: threadId,
      message_id: messageId,
      description,
      deadline: deadline ?? null,
      assignee: assignee ?? null,
      status: "pending",
      source: "user_created",
    })
    .select()
    .single();

  if (iErr || !task) {
    return NextResponse.json(
      { error: iErr?.message ?? "Failed to create task" },
      { status: 500 },
    );
  }

  return NextResponse.json({ task }, { status: 201 });
}
