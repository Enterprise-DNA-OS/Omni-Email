import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_CLASSIFICATIONS = ["vip", "safe", "blocked", "never_auto_send"] as const;
type Classification = (typeof VALID_CLASSIFICATIONS)[number];

function isValidClassification(value: unknown): value is Classification {
  return VALID_CLASSIFICATIONS.includes(value as Classification);
}

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
  const classificationFilter = searchParams.get("classification");

  if (classificationFilter !== null && !isValidClassification(classificationFilter)) {
    return NextResponse.json({ error: "Invalid classification filter" }, { status: 400 });
  }

  let query = supabase
    .from("sender_classifications")
    .select("id, email_or_domain, classification, notes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (classificationFilter) {
    query = query.eq("classification", classificationFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sender_classifications: data ?? [] });
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

  let body: { email_or_domain?: unknown; classification?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailOrDomain = typeof body.email_or_domain === "string" ? body.email_or_domain.toLowerCase().trim() : "";
  if (!emailOrDomain) {
    return NextResponse.json({ error: "email_or_domain is required" }, { status: 400 });
  }

  if (!isValidClassification(body.classification)) {
    return NextResponse.json(
      { error: `classification must be one of: ${VALID_CLASSIFICATIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  // Upsert: if the same (user, email_or_domain, classification) already exists, update notes
  const { data, error } = await supabase
    .from("sender_classifications")
    .upsert(
      {
        user_id: user.id,
        email_or_domain: emailOrDomain,
        classification: body.classification,
        notes,
      },
      { onConflict: "user_id,email_or_domain,classification" },
    )
    .select("id, email_or_domain, classification, notes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ sender_classification: data }, { status: 201 });
}
