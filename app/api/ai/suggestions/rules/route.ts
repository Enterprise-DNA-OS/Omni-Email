import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRuleSuggestions } from "@/lib/ai/behavioral-learning";

/**
 * GET /api/ai/suggestions/rules
 *
 * Analyzes the authenticated user's recent behavior signals and returns
 * AI-generated rule suggestions they can review and enable.
 *
 * Returns:
 *   { suggestions: RuleSuggestion[] }
 */
export async function GET(_request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const suggestions = await generateRuleSuggestions(user.id);
    return NextResponse.json({ suggestions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    if (msg.includes("rate limit")) {
      return NextResponse.json({ error: msg }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
