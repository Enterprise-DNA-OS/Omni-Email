import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Condition } from "@/lib/rules/conditions";
import type { Action } from "@/lib/rules/actions";

type Ctx = { params: Promise<{ id: string }> };

const VALID_FIELDS = new Set([
  "sender_email",
  "sender_domain",
  "subject",
  "body",
  "ai_category",
  "ai_priority",
  "ai_intent",
  "has_attachments",
  "is_first_time_sender",
  "account_id",
]);

const VALID_OPERATORS = new Set([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_regex",
  "in_list",
]);

const VALID_LOGICS = new Set(["AND", "OR"]);

const VALID_ACTION_TYPES = new Set([
  "apply_tag",
  "archive",
  "delete",
  "forward",
  "star",
  "set_priority",
  "mark_vip",
  "auto_reply",
  "move_to_approval",
  "suppress_ai",
]);

function validateConditions(raw: unknown): Condition[] | null {
  if (!Array.isArray(raw)) return null;
  for (const c of raw) {
    if (
      typeof c !== "object" ||
      c === null ||
      !VALID_FIELDS.has(c.field) ||
      !VALID_OPERATORS.has(c.operator) ||
      !VALID_LOGICS.has(c.logic)
    ) {
      return null;
    }
    if (c.value === undefined || c.value === null) return null;
  }
  return raw as Condition[];
}

function validateActions(raw: unknown): Action[] | null {
  if (!Array.isArray(raw)) return null;
  for (const a of raw) {
    if (
      typeof a !== "object" ||
      a === null ||
      !VALID_ACTION_TYPES.has(a.type)
    ) {
      return null;
    }
    if (typeof a.params !== "object" || a.params === null) return null;
  }
  return raw as Action[];
}

// ---------------------------------------------------------------------------
// GET /api/rules/[id] — fetch a single rule
// ---------------------------------------------------------------------------

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
    .from("rules")
    .select(
      "id, name, conditions, actions, enabled, priority, match_count, last_matched_at, created_at, updated_at",
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

  return NextResponse.json({ rule: data });
}

// ---------------------------------------------------------------------------
// PUT /api/rules/[id] — update a rule
// ---------------------------------------------------------------------------

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

  // Verify ownership
  const { data: existing } = await supabase
    .from("rules")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("name" in b) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    updates.name = name;
  }

  if ("conditions" in b) {
    const conditions = validateConditions(b.conditions);
    if (conditions === null) {
      return NextResponse.json(
        { error: "conditions must be an array of valid condition objects" },
        { status: 400 },
      );
    }
    updates.conditions = conditions;
  }

  if ("actions" in b) {
    const actions = validateActions(b.actions);
    if (actions === null) {
      return NextResponse.json(
        { error: "actions must be an array of valid action objects" },
        { status: 400 },
      );
    }
    if (actions.length === 0) {
      return NextResponse.json({ error: "at least one action is required" }, { status: 400 });
    }
    updates.actions = actions;
  }

  if ("enabled" in b) {
    if (typeof b.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    updates.enabled = b.enabled;
  }

  if ("priority" in b) {
    if (typeof b.priority !== "number") {
      return NextResponse.json({ error: "priority must be a number" }, { status: 400 });
    }
    updates.priority = Math.floor(b.priority);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rules")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(
      "id, name, conditions, actions, enabled, priority, match_count, last_matched_at, created_at, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rule: data });
}

// ---------------------------------------------------------------------------
// DELETE /api/rules/[id] — delete a rule
// ---------------------------------------------------------------------------

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

  const admin = createAdminClient();
  const { error } = await admin
    .from("rules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
