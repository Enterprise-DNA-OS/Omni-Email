import { createClient } from "@/lib/supabase/server";
import { getChatHistory, clearChatHistory } from "@/lib/ai/chat-with-inbox";

export async function GET(req: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

  try {
    const messages = await getChatHistory(user.id, limit);
    return Response.json({ messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load history";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await clearChatHistory(user.id);
    return Response.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to clear history";
    return Response.json({ error: msg }, { status: 500 });
  }
}
