import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type KnowledgeType = "fact" | "preference" | "procedure" | "snippet";
type KnowledgeScope = "global" | "sender" | "domain" | "topic";

interface CreateKnowledgeBody {
  type?: string;
  title?: string;
  content?: string;
  scope?: string;
  scope_value?: string | null;
  is_active?: boolean;
}

const VALID_TYPES = new Set<KnowledgeType>(["fact", "preference", "procedure", "snippet"]);
const VALID_SCOPES = new Set<KnowledgeScope>(["global", "sender", "domain", "topic"]);

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const scope = url.searchParams.get("scope");
  const search = url.searchParams.get("search")?.trim() ?? "";
  const activeParam = url.searchParams.get("active");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  // Validate optional filters
  if (type && !VALID_TYPES.has(type as KnowledgeType)) {
    return NextResponse.json({ error: "Invalid type filter" }, { status: 400 });
  }
  if (scope && !VALID_SCOPES.has(scope as KnowledgeScope)) {
    return NextResponse.json({ error: "Invalid scope filter" }, { status: 400 });
  }

  let query = supabase
    .from("knowledge_entries")
    .select(
      "id, type, title, content, scope, scope_value, usage_count, last_used_at, is_active, created_at, updated_at",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq("type", type);
  if (scope) query = query.eq("scope", scope);
  if (activeParam === "true") query = query.eq("is_active", true);
  if (activeParam === "false") query = query.eq("is_active", false);
  if (search) {
    query = query.textSearch("search_vector", search, {
      type: "plain",
      config: "english",
    });
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], total: count ?? 0 });
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

  let body: CreateKnowledgeBody;
  try {
    body = (await request.json()) as CreateKnowledgeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, title, content, scope, scope_value, is_active } = body;

  if (!type || !VALID_TYPES.has(type as KnowledgeType)) {
    return NextResponse.json(
      { error: "type must be one of: fact, preference, procedure, snippet" },
      { status: 400 },
    );
  }
  const trimmedTitle = title?.trim() ?? "";
  if (!trimmedTitle) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const trimmedContent = content?.trim() ?? "";
  if (!trimmedContent) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const resolvedScope: KnowledgeScope =
    scope && VALID_SCOPES.has(scope as KnowledgeScope)
      ? (scope as KnowledgeScope)
      : "global";

  // Scoped entries must have a scope_value
  if (resolvedScope !== "global" && !scope_value?.trim()) {
    return NextResponse.json(
      { error: "scope_value is required for non-global scope" },
      { status: 400 },
    );
  }

  // Use admin client for the insert since RLS on INSERT requires user_id = auth.uid()
  // which works fine with the regular client — keep it simple
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("knowledge_entries")
    .insert({
      user_id: user.id,
      type,
      title: trimmedTitle,
      content: trimmedContent,
      scope: resolvedScope,
      scope_value: resolvedScope === "global" ? null : (scope_value?.trim() ?? null),
      is_active: is_active !== false,
    })
    .select(
      "id, type, title, content, scope, scope_value, usage_count, last_used_at, is_active, created_at, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}
