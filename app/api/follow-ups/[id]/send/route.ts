import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateFollowUpDraft } from "@/lib/ai/follow-up";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/follow-ups/:id/send
 *
 * Generate an AI follow-up draft for the given follow_up record and return it.
 * The follow_up must belong to the authenticated user.
 *
 * Returns { success: true, draftId: string }
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

  const admin = createAdminClient();

  // Verify the follow_up record belongs to the authenticated user
  const { data: followUp, error: fetchErr } = await admin
    .from("follow_ups")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!followUp) {
    return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  }

  // Prevent generating drafts for cancelled or already-replied follow-ups
  const status = followUp.status as string;
  if (status === "replied" || status === "cancelled") {
    return NextResponse.json(
      { error: `Cannot generate draft for a follow-up with status '${status}'` },
      { status: 400 },
    );
  }

  let draftId: string;
  try {
    draftId = await generateFollowUpDraft(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate follow-up draft";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ success: true, draftId });
}
