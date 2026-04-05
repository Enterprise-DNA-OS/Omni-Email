/**
 * GET  /api/ai/settings — Return the AI-related fields from user_preferences
 * PATCH /api/ai/settings — Update one or more AI-related fields
 *
 * AI-related fields managed here:
 *   action_thresholds  jsonb  — confidence cutoffs for automated actions
 *   feature_flags      jsonb  — per-feature enable/disable overrides
 *   operating_mode     text   — active mode (default | ceo | assistant | …)
 *   mode_config        jsonb  — per-mode overrides
 *
 * The ChatPanel calls PATCH with arbitrary { settingKey: settingValue } pairs
 * sourced from the AI's update_settings action. Only the allowed keys above
 * are accepted; unknown keys are rejected with 400.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Keys that the AI settings endpoint is permitted to read and write. */
const ALLOWED_KEYS = new Set([
  "action_thresholds",
  "feature_flags",
  "operating_mode",
  "mode_config",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiSettings {
  action_thresholds: Record<string, number>;
  feature_flags: Record<string, unknown>;
  operating_mode: string | null;
  mode_config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// GET /api/ai/settings
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

  const { data, error } = await supabase
    .from("user_preferences")
    .select("action_thresholds, feature_flags, operating_mode, mode_config")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If the row doesn't exist yet, return the schema defaults so the caller
  // always gets a well-formed object.
  const settings: AiSettings = {
    action_thresholds: (data?.action_thresholds as Record<string, number> | null) ?? {
      archive: 0.85,
      delete: 0.95,
      send: 0.95,
      label: 0.7,
    },
    feature_flags: (data?.feature_flags as Record<string, unknown> | null) ?? {},
    operating_mode: (data?.operating_mode as string | null) ?? null,
    mode_config: (data?.mode_config as Record<string, unknown> | null) ?? {},
  };

  return NextResponse.json({ settings });
}

// ---------------------------------------------------------------------------
// PATCH /api/ai/settings
// ---------------------------------------------------------------------------

export async function PATCH(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;

  // Reject any key not in the allowed set
  const unknownKeys = Object.keys(patch).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown setting key(s): ${unknownKeys.join(", ")}` },
      { status: 400 },
    );
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No settings provided" }, { status: 400 });
  }

  // Upsert into user_preferences so the row is created if it doesn't exist yet.
  const { error: upsertErr } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
