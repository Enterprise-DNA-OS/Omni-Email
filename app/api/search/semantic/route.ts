import { createClient } from "@/lib/supabase/server";
import { semanticSearch } from "@/lib/ai/semantic-search";

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query?: unknown; limit?: unknown };
  try {
    body = (await req.json()) as { query?: unknown; limit?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { query, limit } = body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const parsedLimit =
    typeof limit === "number" && limit > 0 && limit <= 50 ? limit : 20;

  try {
    const results = await semanticSearch(user.id, query.trim(), parsedLimit);
    return Response.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status });
  }
}
