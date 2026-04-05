import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Count distinct threads that have unread messages and are not archived
  const { data, error } = await admin.rpc("get_unread_thread_count", { uid: user.id });

  if (error) {
    // Fallback: manual query if RPC doesn't exist
    const { data: threads } = await admin
      .from("threads")
      .select("id")
      .eq("user_id", user.id)
      .is("archived_at", null);

    if (!threads || threads.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const threadIds = threads.map((t) => t.id as string);
    const { data: unreadMsgs } = await admin
      .from("messages")
      .select("thread_id")
      .in("thread_id", threadIds)
      .eq("is_read", false);

    const unreadThreadIds = new Set((unreadMsgs ?? []).map((m) => m.thread_id as string));
    return NextResponse.json({ count: unreadThreadIds.size });
  }

  return NextResponse.json({ count: data ?? 0 });
}
