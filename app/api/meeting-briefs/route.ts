import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface AttendeeContext {
  name: string;
  email: string;
  recentThreadSummaries: string[];
  openActionItems: string[];
}

interface GenerateRequestBody {
  eventId?: string;
  eventTitle: string;
  eventStart: string;
  attendees: { name?: string; email: string }[];
  accountId: string;
}

// GET /api/meeting-briefs — list briefs for the current user
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
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  let query = supabase
    .from("meeting_briefs")
    .select("*")
    .eq("user_id", user.id)
    .order("event_start", { ascending: true })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: briefs, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to fetch briefs" }, { status: 500 });
  }

  return NextResponse.json({ data: briefs ?? [] });
}

// POST /api/meeting-briefs — generate a brief for a specific event
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GenerateRequestBody;
  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.eventTitle || !body.eventStart || !body.accountId) {
    return NextResponse.json(
      { error: "eventTitle, eventStart, and accountId are required" },
      { status: 400 },
    );
  }

  // Verify account belongs to user
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", body.accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Insert a brief row in 'generating' status
  const { data: brief, error: insertErr } = await admin
    .from("meeting_briefs")
    .insert({
      user_id: user.id,
      account_id: body.accountId,
      event_id: body.eventId ?? null,
      event_title: body.eventTitle,
      event_start: body.eventStart,
      attendees: body.attendees ?? [],
      status: "generating",
    })
    .select()
    .single();

  if (insertErr || !brief) {
    return NextResponse.json({ error: "Failed to create brief record" }, { status: 500 });
  }

  // Gather attendee context from contacts and recent threads
  const attendees = body.attendees ?? [];
  const attendeeContexts: AttendeeContext[] = [];

  for (const attendee of attendees) {
    const ctx: AttendeeContext = {
      name: attendee.name ?? attendee.email,
      email: attendee.email,
      recentThreadSummaries: [],
      openActionItems: [],
    };

    // Find recent threads with this attendee
    const { data: threads } = await supabase
      .from("threads")
      .select("subject, ai_summary, ai_intent")
      .eq("user_id", user.id)
      .not("ai_summary", "is", null)
      .ilike("snippet", `%${attendee.email}%`)
      .order("last_message_at", { ascending: false })
      .limit(3);

    if (threads && threads.length > 0) {
      ctx.recentThreadSummaries = threads.map((t) => {
        const subject = (t.subject as string) ?? "(no subject)";
        const summary = (t.ai_summary as string) ?? "";
        return summary ? `"${subject}": ${summary}` : `"${subject}"`;
      });
    }

    // Find open tasks related to this attendee
    const { data: tasks } = await supabase
      .from("tasks")
      .select("description")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .ilike("description", `%${attendee.email.split("@")[0]}%`)
      .limit(3);

    if (tasks && tasks.length > 0) {
      ctx.openActionItems = tasks.map((t) => t.description as string);
    }

    attendeeContexts.push(ctx);
  }

  // Call the edge function
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    await admin
      .from("meeting_briefs")
      .update({ status: "failed" })
      .eq("id", brief.id as string);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-meeting-brief`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      eventTitle: body.eventTitle,
      eventStart: body.eventStart,
      attendees: attendeeContexts,
    }),
  });

  if (efRes.status === 429) {
    await admin
      .from("meeting_briefs")
      .update({ status: "failed" })
      .eq("id", brief.id as string);
    return NextResponse.json(
      { error: "AI rate limit reached — please try again shortly" },
      { status: 429 },
    );
  }

  if (!efRes.ok) {
    await admin
      .from("meeting_briefs")
      .update({ status: "failed" })
      .eq("id", brief.id as string);
    const text = await efRes.text();
    return NextResponse.json(
      { error: `AI service error (${efRes.status}): ${text}` },
      { status: 500 },
    );
  }

  const efData = (await efRes.json()) as { briefContent?: string; error?: string };
  if (!efData.briefContent) {
    await admin
      .from("meeting_briefs")
      .update({ status: "failed" })
      .eq("id", brief.id as string);
    return NextResponse.json({ error: "AI returned empty content" }, { status: 500 });
  }

  // Persist the generated brief
  const { data: updated, error: updateErr } = await admin
    .from("meeting_briefs")
    .update({
      brief_content: efData.briefContent,
      status: "ready",
      generated_at: new Date().toISOString(),
    })
    .eq("id", brief.id as string)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ error: "Failed to save brief" }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}
