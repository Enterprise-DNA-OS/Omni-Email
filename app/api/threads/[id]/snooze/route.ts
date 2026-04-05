import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { snoozeThread, unsnoozeThread } from "@/lib/email/snooze";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/threads/[id]/snooze
 * Body: { until: ISO-8601 timestamp }
 * Snoozes the thread until the given time.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("until" in body) ||
    typeof (body as Record<string, unknown>).until !== "string"
  ) {
    return NextResponse.json({ error: "Missing required field: until (ISO-8601 string)" }, { status: 400 });
  }

  const until = new Date((body as { until: string }).until);
  if (isNaN(until.getTime())) {
    return NextResponse.json({ error: "Invalid until value — must be a valid ISO-8601 timestamp" }, { status: 400 });
  }
  if (until <= new Date()) {
    return NextResponse.json({ error: "until must be in the future" }, { status: 400 });
  }

  try {
    await snoozeThread(threadId, user.id, until);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Snooze failed";
    // snoozeThread throws "snoozeThread failed: ..." for db errors; a missing thread returns no rows
    // but does not error, so treat all errors as 500
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/threads/[id]/snooze
 * Removes the snooze from the thread immediately.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await context.params;

  try {
    await unsnoozeThread(threadId, user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unsnooze failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
