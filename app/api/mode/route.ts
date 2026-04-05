import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OPERATING_MODES,
  getModeOverrides,
  isValidMode,
  type ModeConfig,
  type OperatingMode,
} from "@/lib/ai/operating-modes";

// ---------------------------------------------------------------------------
// GET /api/mode — return the current operating mode and its effective config
// ---------------------------------------------------------------------------

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("operating_mode, mode_config")
    .eq("user_id", user.id)
    .maybeSingle();

  const mode: OperatingMode =
    prefs?.operating_mode && isValidMode(prefs.operating_mode as string)
      ? (prefs.operating_mode as OperatingMode)
      : "default";

  const userConfig = (prefs?.mode_config ?? {}) as Partial<ModeConfig>;
  const effectiveConfig = getModeOverrides(mode, userConfig);
  const definition = OPERATING_MODES[mode];

  return NextResponse.json({
    mode,
    label: definition.label,
    description: definition.description,
    config: effectiveConfig,
  });
}

// ---------------------------------------------------------------------------
// POST /api/mode — activate a mode, optionally with config overrides
// Body: { mode: OperatingMode, config?: Partial<ModeConfig> }
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mode: string;
  let config: Partial<ModeConfig> | undefined;
  try {
    const body = (await request.json()) as {
      mode?: string;
      config?: Partial<ModeConfig>;
    };
    mode = body.mode ?? "";
    config = body.config;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!mode || !isValidMode(mode)) {
    return NextResponse.json(
      {
        error: `Invalid mode. Valid modes: ${Object.keys(OPERATING_MODES).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Upsert user_preferences with new mode
  const { error: upsertErr } = await admin
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        operating_mode: mode,
        mode_config: config ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to update mode: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  const effectiveConfig = getModeOverrides(mode as OperatingMode, config);
  const definition = OPERATING_MODES[mode as OperatingMode];

  return NextResponse.json({
    success: true,
    mode,
    label: definition.label,
    config: effectiveConfig,
  });
}
