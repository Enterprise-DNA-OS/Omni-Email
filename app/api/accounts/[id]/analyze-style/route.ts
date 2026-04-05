import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeWritingStyle, getStyleContext } from "@/lib/ai/tone-learning";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/accounts/[id]/analyze-style
 *
 * Triggers a writing style analysis for the given account.
 * Loads the last 50 sent messages, calls the AI edge function, and stores
 * the resulting profile in accounts.writing_style_profile.
 *
 * Returns:
 *   { profile: string | null }
 */
export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the account belongs to this user before doing any AI work
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const profile = await analyzeWritingStyle(id, user.id);
    return NextResponse.json({ profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    if (msg.includes("rate limit")) {
      return NextResponse.json({ error: msg }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/accounts/[id]/analyze-style
 *
 * Returns the stored writing style profile for the given account.
 * Does not trigger a new analysis — call POST to refresh.
 *
 * Returns:
 *   { profile: string | null, analyzedAt: string | null }
 */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, writing_style_profile, style_analyzed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // getStyleContext is used here for consistency — it reads through admin client
  const profile = await getStyleContext(id);

  return NextResponse.json({
    profile,
    analyzedAt: (account.style_analyzed_at as string | null) ?? null,
  });
}
