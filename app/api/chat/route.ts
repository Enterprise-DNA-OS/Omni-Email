import { createClient } from "@/lib/supabase/server";
import { processUserMessage } from "@/lib/ai/chat-with-inbox";

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: unknown; context?: unknown };
  try {
    body = (await req.json()) as { message?: unknown; context?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, context } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  if (context !== undefined && typeof context !== "string") {
    return Response.json({ error: "context must be a string" }, { status: 400 });
  }

  try {
    const result = await processUserMessage(
      user.id,
      message.trim(),
      typeof context === "string" ? context : undefined,
    );
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chat failed";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status });
  }
}
