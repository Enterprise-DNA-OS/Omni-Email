import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface BriefSettings {
  meeting_briefs_enabled: boolean;
  meeting_briefs_lead_minutes: number;
}

// GET /api/meeting-briefs/settings
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: prefs, error } = await supabase
    .from("user_preferences")
    .select("meeting_briefs_enabled, meeting_briefs_lead_minutes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }

  const settings: BriefSettings = {
    meeting_briefs_enabled: (prefs?.meeting_briefs_enabled as boolean) ?? false,
    meeting_briefs_lead_minutes: (prefs?.meeting_briefs_lead_minutes as number) ?? 30,
  };

  return NextResponse.json({ data: settings });
}

// PUT /api/meeting-briefs/settings
export async function PUT(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<BriefSettings>;
  try {
    body = (await request.json()) as Partial<BriefSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Partial<BriefSettings> = {};

  if (typeof body.meeting_briefs_enabled === "boolean") {
    update.meeting_briefs_enabled = body.meeting_briefs_enabled;
  }

  if (typeof body.meeting_briefs_lead_minutes === "number") {
    const lead = body.meeting_briefs_lead_minutes;
    if (lead < 5 || lead > 1440) {
      return NextResponse.json(
        { error: "meeting_briefs_lead_minutes must be between 5 and 1440" },
        { status: 400 },
      );
    }
    update.meeting_briefs_lead_minutes = lead;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: upsertErr } = await admin
    .from("user_preferences")
    .upsert(
      { user_id: user.id, ...update, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
