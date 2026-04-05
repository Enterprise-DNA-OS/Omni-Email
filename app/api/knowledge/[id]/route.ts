import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

type KnowledgeType = "fact" | "preference" | "procedure" | "snippet";
type KnowledgeScope = "global" | "sender" | "domain" | "topic";

interface UpdateKnowledgeBody {
  title?: string;
  content?: string;
  scope?: string;
  scope_value?: string | null;
  is_active?: boolean;
}

const VALID_TYPES = new Set<KnowledgeType>(["fact", "preference", "procedure", "snippet"]);
const VALID_SCOPES = new Set<KnowledgeScope>(["global", "sender", "domain", "topic"]);

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
    .from("knowledge_entries")
    .select(
      "id, type, title, content, scope, scope_value, usage_count, last_used_at, is_active, created_at, updated_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ entry: data });
}

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateKnowledgeBody;
  try {
    body = (await request.json()) as UpdateKnowledgeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    if (!trimmed) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    updates.title = trimmed;
  }
  if (body.content !== undefined) {
    const trimmed = body.content.trim();
    if (!trimmed) return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
    updates.content = trimmed;
  }
  if (body.scope !== undefined) {
    if (!VALID_SCOPES.has(body.scope as KnowledgeScope)) {
      return NextResponse.json({ error: "Invalid scope value" }, { status: 400 });
    }
    updates.scope = body.scope;
  }
  if (body.scope_value !== undefined) {
    updates.scope_value = body.scope_value?.trim() || null;
  }
  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify ownership before update
  const { data: existing } = await admin
    .from("knowledge_entries")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((existing as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("knowledge_entries")
    .update(updates)
    .eq("id", id)
    .select(
      "id, type, title, content, scope, scope_value, usage_count, last_used_at, is_active, created_at, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ entry: data });
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS ensures the user can only delete their own entries
  const { error } = await supabase
    .from("knowledge_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

