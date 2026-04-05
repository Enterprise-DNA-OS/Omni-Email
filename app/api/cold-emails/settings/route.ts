import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ColdEmailSettingsResponse {
  enabled: boolean;
  mode: "list" | "label" | "archive";
  customCriteria: string | null;
}

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
    .select("cold_email_enabled, cold_email_mode, cold_email_custom_criteria")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: ColdEmailSettingsResponse = {
    enabled: (prefs?.cold_email_enabled as boolean | null) ?? false,
    mode: ((prefs?.cold_email_mode as string | null) ?? "list") as ColdEmailSettingsResponse["mode"],
    customCriteria: (prefs?.cold_email_custom_criteria as string | null) ?? null,
  };

  return NextResponse.json({ settings });
}

interface PutBody {
  enabled?: boolean;
  mode?: string;
  customCriteria?: string | null;
}

export async function PUT(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validModes = ["list", "label", "archive"];
  if (body.mode !== undefined && !validModes.includes(body.mode)) {
    return NextResponse.json({ error: "Invalid mode value" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.cold_email_enabled = body.enabled;
  if (body.mode !== undefined) updates.cold_email_mode = body.mode;
  if (body.customCriteria !== undefined) updates.cold_email_custom_criteria = body.customCriteria;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: upsertErr } = await admin
    .from("user_preferences")
    .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
