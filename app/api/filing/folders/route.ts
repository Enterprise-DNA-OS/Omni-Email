import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/email/sync";
import { listDriveFolders } from "@/lib/storage/google-drive";
import { listOneDriveFolders } from "@/lib/storage/onedrive";

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const parentId = searchParams.get("parentId") ?? undefined;

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  // Verify account belongs to user
  const { data: account } = await supabase
    .from("accounts")
    .select("id, provider")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const acc = account as { id: string; provider: string };

  // Get filing config to determine provider
  const admin = createAdminClient();
  const { data: config } = await admin
    .from("filing_config")
    .select("storage_provider, root_folder_id")
    .eq("account_id", accountId)
    .maybeSingle();

  const storageProvider = config
    ? (config as { storage_provider: string }).storage_provider
    : acc.provider === "gmail"
    ? "google_drive"
    : "onedrive";

  const rootFolderId = config
    ? (config as { root_folder_id: string | null }).root_folder_id ?? undefined
    : undefined;

  try {
    const accessToken = await getValidAccessToken(accountId);
    const effectiveParent = parentId ?? rootFolderId;

    let folders: Array<{ id: string; name: string; path?: string }> = [];

    if (storageProvider === "google_drive") {
      folders = await listDriveFolders(accessToken, effectiveParent);
    } else {
      folders = await listOneDriveFolders(accessToken, effectiveParent);
    }

    return NextResponse.json({ folders, provider: storageProvider });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list folders";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
