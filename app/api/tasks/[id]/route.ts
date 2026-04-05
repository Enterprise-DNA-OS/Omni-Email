import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = ["pending", "done", "dismissed"] as const;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let updates: Record<string, unknown> = {};
  try {
    const body = (await request.json()) as {
      status?: string;
      description?: string;
      deadline?: string | null;
      assignee?: string | null;
    };

    if (
      body.status &&
      (VALID_STATUSES as readonly string[]).includes(body.status)
    ) {
      updates.status = body.status;
      if (body.status === "done") {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }
    }
    if (typeof body.description === "string" && body.description.trim()) {
      updates.description = body.description.trim();
    }
    if (body.deadline !== undefined) {
      if (body.deadline === null || body.deadline === "") {
        updates.deadline = null;
      } else if (!isNaN(Date.parse(body.deadline))) {
        updates.deadline = body.deadline;
      } else {
        return NextResponse.json(
          { error: "deadline must be a valid ISO 8601 date string" },
          { status: 400 },
        );
      }
    }
    if (body.assignee !== undefined) {
      updates.assignee = body.assignee?.trim() || null;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error: uErr } = await admin
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (uErr || !updated) {
    return NextResponse.json(
      { error: uErr?.message ?? "Update failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ task: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership before deletion
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error: dErr } = await admin.from("tasks").delete().eq("id", id);

  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
