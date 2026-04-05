import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .from("accounts")
    .select(
      "id, provider, email_address, token_expires_at, token_invalid_at, next_sync_at, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const accounts = (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    emailAddress: row.email_address,
    status:
      row.token_invalid_at != null
        ? "invalid"
        : row.token_expires_at && new Date(row.token_expires_at).getTime() < now
          ? "expired"
          : "connected",
    tokenExpiresAt: row.token_expires_at,
    nextSyncAt: row.next_sync_at,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ accounts });
}
