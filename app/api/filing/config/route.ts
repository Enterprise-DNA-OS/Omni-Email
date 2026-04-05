import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("filing_config")
    .select("id, account_id, enabled, storage_provider, root_folder_id, root_folder_name, auto_file, created_at, updated_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configs: data ?? [] });
}

interface PutBody {
  accountId: string;
  enabled?: boolean;
  storageProvider: "google_drive" | "onedrive";
  rootFolderId?: string | null;
  rootFolderName?: string | null;
  autoFile?: boolean;
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

  const { accountId, enabled, storageProvider, rootFolderId, rootFolderName, autoFile } = body;

  if (!accountId || !storageProvider) {
    return NextResponse.json({ error: "accountId and storageProvider are required" }, { status: 400 });
  }

  if (!["google_drive", "onedrive"].includes(storageProvider)) {
    return NextResponse.json({ error: "Invalid storageProvider" }, { status: 400 });
  }

  // Verify the account belongs to this user
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("filing_config")
    .upsert(
      {
        user_id: user.id,
        account_id: accountId,
        enabled: enabled ?? false,
        storage_provider: storageProvider,
        root_folder_id: rootFolderId ?? null,
        root_folder_name: rootFolderName ?? null,
        auto_file: autoFile ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}
