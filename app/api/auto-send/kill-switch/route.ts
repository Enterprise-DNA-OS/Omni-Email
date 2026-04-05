import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * POST /api/auto-send/kill-switch
 *
 * Immediately disables ALL auto-send configuration for the authenticated user
 * by setting enabled = false on every auto_send_config row. This is a global
 * kill-switch intended for the settings page / emergency use.
 */
export async function POST(_request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("auto_send_config")
    .update({ enabled: false })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await logAuditEvent({
      userId: user.id,
      actor: "user",
      action: "auto_send.kill_switch",
      targetType: "auto_send_config",
      details: {},
      reversible: false,
    });
  } catch {
    // Audit failure must not block the response
  }

  return NextResponse.json({ ok: true });
}
