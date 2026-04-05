import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/meeting-briefs/[id] — fetch a single brief
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: brief, error } = await supabase
    .from("meeting_briefs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch brief" }, { status: 500 });
  }
  if (!brief) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Mark as delivered if it was ready and not yet delivered
  if ((brief.status as string) === "ready" && !brief.delivered_at) {
    const admin = createAdminClient();
    await admin
      .from("meeting_briefs")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json({ data: brief });
}

// DELETE /api/meeting-briefs/[id] — delete a brief
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership via RLS-scoped client first
  const { data: brief } = await supabase
    .from("meeting_briefs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brief) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error: deleteErr } = await admin
    .from("meeting_briefs")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json({ error: "Failed to delete brief" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
