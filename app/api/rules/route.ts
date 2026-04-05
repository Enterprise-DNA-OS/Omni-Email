import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Condition } from "@/lib/rules/conditions";
import type { Action } from "@/lib/rules/actions";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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
// GET /api/rules — list all rules for the authenticated user
// ---------------------------------------------------------------------------

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
    .from("rules")
    .select(
      "id, name, conditions, actions, enabled, priority, match_count, last_matched_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/rules — create a new rule
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const conditions = validateConditions(b.conditions ?? []);
  if (conditions === null) {
    return NextResponse.json(
      { error: "conditions must be an array of valid condition objects" },
      { status: 400 },
    );
  }

  const actions = validateActions(b.actions ?? []);
  if (actions === null) {
    return NextResponse.json(
      { error: "actions must be an array of valid action objects" },
      { status: 400 },
    );
  }

  if (actions.length === 0) {
    return NextResponse.json({ error: "at least one action is required" }, { status: 400 });
  }

  const priority = typeof b.priority === "number" ? Math.floor(b.priority) : 0;
  const enabled = typeof b.enabled === "boolean" ? b.enabled : true;

  // Use admin client for insert since authenticated users have INSERT via RLS,
  // but we set user_id server-side to prevent spoofing.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rules")
    .insert({
      user_id: user.id,
      name,
      conditions,
      actions,
      enabled,
      priority,
    })
    .select(
      "id, name, conditions, actions, enabled, priority, match_count, last_matched_at, created_at, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Reset rules_processed_at on all active threads so the next sync cycle
  // re-evaluates them against all rules, including the one just created.
  // This is non-fatal: a failure here does not roll back the rule creation.
  try {
    await admin
      .from("threads")
      .update({ rules_processed_at: null })
      .eq("user_id", user.id)
      .is("archived_at", null);
  } catch (e) {
    console.error("rules/route POST: failed to reset rules_processed_at:", e);
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}
