import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  // Upsert user_preferences, updating last_session_at to now
  const { error } = await adminClient
    .from("user_preferences")
    .upsert(
      { user_id: user.id, last_session_at: now, updated_at: now },
      { onConflict: "user_id" },
    );

  if (error) {
    return NextResponse.json({ error: "Failed to update session timestamp" }, { status: 500 });
  }

  return NextResponse.json({ success: true, last_session_at: now });
}
