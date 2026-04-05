import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFilingRecord, executeFilingJob } from "@/lib/storage/filing-engine";

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
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  let query = supabase
    .from("document_filing")
    .select(
      "id, filename, mime_type, file_size, storage_provider, destination_folder, destination_folder_id, storage_file_id, storage_url, status, ai_confidence, ai_reasoning, error_message, filed_at, created_at, thread_id, message_id, account_id",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ filings: data ?? [], total: count ?? 0 });
}

interface PostBody {
  messageId: string;
  filename: string;
  mimeType?: string | null;
  fileSize?: number | null;
  autoFile?: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messageId, filename, mimeType, fileSize, autoFile } = body;
  if (!messageId || !filename) {
    return NextResponse.json({ error: "messageId and filename are required" }, { status: 400 });
  }

  // Verify message ownership via thread
  const { data: msg } = await supabase
    .from("messages")
    .select("account_id, thread_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const msgRow = msg as { account_id: string; thread_id: string | null };

  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("id", msgRow.thread_id ?? "")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread && msgRow.thread_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Get filing config for the account
  const admin = createAdminClient();
  const { data: config } = await admin
    .from("filing_config")
    .select("storage_provider, enabled")
    .eq("account_id", msgRow.account_id)
    .maybeSingle();

  if (!config) {
    return NextResponse.json(
      { error: "No filing config for this account. Configure filing in settings first." },
      { status: 422 },
    );
  }

  const configRow = config as { storage_provider: "google_drive" | "onedrive"; enabled: boolean };

  if (!configRow.enabled) {
    return NextResponse.json(
      { error: "Filing is disabled for this account." },
      { status: 422 },
    );
  }

  try {
    const filingId = await createFilingRecord({
      userId: user.id,
      accountId: msgRow.account_id,
      threadId: msgRow.thread_id,
      messageId,
      filename,
      mimeType: mimeType ?? null,
      fileSize: fileSize ?? null,
      storageProvider: configRow.storage_provider,
      autoFile: autoFile ?? false,
    });

    return NextResponse.json({ id: filingId, status: "pending" }, { status: 201 });
  } catch (e) {
    const msg2 = e instanceof Error ? e.message : "Failed to create filing";
    return NextResponse.json({ error: msg2 }, { status: 500 });
  }
}
