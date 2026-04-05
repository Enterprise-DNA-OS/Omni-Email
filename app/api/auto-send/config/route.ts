import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_SCOPE_TYPES = ["sender", "domain", "category"] as const;
type ScopeType = (typeof VALID_SCOPE_TYPES)[number];

/**
 * GET /api/auto-send/config
 *
 * Returns all auto-send configuration entries for the authenticated user,
 * along with the kill-switch state and sends-this-hour count.
 *
 * killSwitch is true when there is at least one config row and ALL of them
 * have enabled = false (i.e. the kill-switch POST was used to pause all).
 *
 * sendsThisHour is the sum of auto_sends_this_hour across the user's accounts.
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

  const { data: configs, error: configsError } = await supabase
    .from("auto_send_config")
    .select("id, scope_type, scope_value, enabled, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (configsError) {
    return NextResponse.json({ error: configsError.message }, { status: 500 });
  }

  const configList = configs ?? [];

  // Kill switch is active when all configs are disabled (and there is at least one)
  const killSwitch =
    configList.length > 0 && configList.every((c) => c.enabled === false);

  // Sum auto_sends_this_hour across the user's connected accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("auto_sends_this_hour")
    .eq("user_id", user.id);

  const sendsThisHour = (accounts ?? []).reduce(
    (sum, a) => sum + ((a.auto_sends_this_hour as number | null) ?? 0),
    0,
  );

  return NextResponse.json({ configs: configList, killSwitch, sendsThisHour });
}

/**
 * POST /api/auto-send/config
 *
 * Create a new auto-send config entry. Body: { scope_type, scope_value, enabled? }
 */
export async function POST(request: Request): Promise<Response> {
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scope_type, scope_value, enabled } = body as {
    scope_type?: unknown;
    scope_value?: unknown;
    enabled?: unknown;
  };

  if (
    typeof scope_type !== "string" ||
    !VALID_SCOPE_TYPES.includes(scope_type as ScopeType)
  ) {
    return NextResponse.json(
      { error: `scope_type must be one of: ${VALID_SCOPE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof scope_value !== "string" || scope_value.trim() === "") {
    return NextResponse.json({ error: "scope_value must be a non-empty string" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auto_send_config")
    .upsert(
      {
        user_id: user.id,
        scope_type: scope_type as ScopeType,
        scope_value: scope_value.trim().toLowerCase(),
        enabled: typeof enabled === "boolean" ? enabled : true,
      },
      { onConflict: "user_id,scope_type,scope_value" },
    )
    .select("id, scope_type, scope_value, enabled, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data }, { status: 201 });
}

/**
 * DELETE /api/auto-send/config?id=<uuid>
 *
 * Remove an auto-send config entry by id.
 */
export async function DELETE(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing required query param: id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("auto_send_config")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
