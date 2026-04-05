import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeFilingJob } from "@/lib/storage/filing-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("document_filing")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ filing: data });
}

interface PatchBody {
  action?: "approve" | "reject" | "retry";
  destination_folder?: string;
  destination_folder_id?: string;
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from("document_filing")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = existing as { id: string; status: string };
  const admin = createAdminClient();

  if (body.action === "reject") {
    await admin
      .from("document_filing")
      .update({ status: "rejected" })
      .eq("id", id);
    return NextResponse.json({ success: true, status: "rejected" });
  }

  if (body.action === "approve" || body.action === "retry") {
    // Allow overriding folder before filing
    const updates: Record<string, unknown> = { status: "pending" };
    if (body.destination_folder) {
      updates.destination_folder = body.destination_folder;
    }
    if (body.destination_folder_id) {
      updates.destination_folder_id = body.destination_folder_id;
    }

    await admin.from("document_filing").update(updates).eq("id", id);

    // Execute filing job asynchronously
    void executeFilingJob(id).catch(() => undefined);

    return NextResponse.json({ success: true, status: "filing" });
  }

  // Plain folder correction without action
  if (body.destination_folder !== undefined) {
    if (!["pending", "failed"].includes(row.status)) {
      return NextResponse.json(
        { error: "Can only correct folder on pending or failed filings" },
        { status: 422 },
      );
    }
    await admin
      .from("document_filing")
      .update({
        destination_folder: body.destination_folder,
        destination_folder_id: body.destination_folder_id ?? null,
      })
      .eq("id", id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No valid action provided" }, { status: 400 });
}
