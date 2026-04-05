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

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  calendar_id: string;
  raw: Record<string, unknown> | null;
}

interface CalendarRow {
  id: string;
  account_id: string;
}

interface PrefsRow {
  meeting_briefs_enabled: boolean;
  meeting_briefs_lead_minutes: number;
}

// POST /api/meeting-briefs/generate — scan upcoming events, auto-generate briefs within lead time
export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load user preferences
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("meeting_briefs_enabled, meeting_briefs_lead_minutes")
    .eq("user_id", user.id)
    .maybeSingle() as { data: PrefsRow | null };

  if (!prefs?.meeting_briefs_enabled) {
    return NextResponse.json({
      message: "Meeting briefs are disabled. Enable them in settings.",
      generated: 0,
    });
  }

  const leadMinutes = prefs.meeting_briefs_lead_minutes ?? 30;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + leadMinutes * 60 * 1000);

  // Find all calendars for this user's accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: "No accounts found", generated: 0 });
  }

  const accountIds = accounts.map((a) => a.id as string);

  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, account_id")
    .in("account_id", accountIds) as { data: CalendarRow[] | null };

  if (!calendars || calendars.length === 0) {
    return NextResponse.json({ message: "No calendars found", generated: 0 });
  }

  const calendarIds = calendars.map((c) => c.id);
  // Map calendar_id -> account_id for quick lookup
  const calendarAccountMap = Object.fromEntries(
    calendars.map((c) => [c.id, c.account_id]),
  );

  // Find upcoming events within the lead window that don't already have a brief
  const { data: events } = await supabase
    .from("events")
    .select("id, title, start_time, end_time, calendar_id, raw")
    .in("calendar_id", calendarIds)
    .gte("start_time", now.toISOString())
    .lte("start_time", windowEnd.toISOString())
    .order("start_time", { ascending: true }) as { data: EventRow[] | null };

  if (!events || events.length === 0) {
    return NextResponse.json({
      message: "No upcoming events in the lead window",
      generated: 0,
    });
  }

  // Filter out events that already have a pending/ready brief
  const eventIds = events.map((e) => e.id);
  const { data: existingBriefs } = await supabase
    .from("meeting_briefs")
    .select("event_id")
    .eq("user_id", user.id)
    .in("event_id", eventIds)
    .in("status", ["pending", "generating", "ready"]);

  const alreadyBriefedIds = new Set(
    (existingBriefs ?? []).map((b) => b.event_id as string),
  );

  const toGenerate = events.filter((e) => !alreadyBriefedIds.has(e.id));

  if (toGenerate.length === 0) {
    return NextResponse.json({
      message: "All upcoming events already have briefs",
      generated: 0,
    });
  }

  const admin = createAdminClient();
  const generated: string[] = [];
  const errors: { eventId: string; error: string }[] = [];

  for (const event of toGenerate) {
    try {
      // Extract attendees from the raw event data
      const raw = event.raw ?? {};
      const rawAttendees =
        (raw.attendees as Array<{ name?: string; email?: string }> | undefined) ?? [];
      const attendees = rawAttendees
        .filter((a) => Boolean(a.email))
        .map((a) => ({ name: a.name ?? a.email ?? "", email: a.email ?? "" }));

      // Resolve account_id from the event's calendar_id
      const accountId = calendarAccountMap[event.calendar_id] ?? accountIds[0];

      // Build attendee context from contacts and recent threads
      const attendeeContexts: AttendeeContext[] = [];
      for (const attendee of attendees) {
        const ctx: AttendeeContext = {
          name: attendee.name,
          email: attendee.email,
          recentThreadSummaries: [],
          openActionItems: [],
        };

        const { data: threads } = await supabase
          .from("threads")
          .select("subject, ai_summary")
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

      // Insert a generating record
      const { data: brief, error: insertErr } = await admin
        .from("meeting_briefs")
        .insert({
          user_id: user.id,
          account_id: accountId,
          event_id: event.id,
          event_title: event.title,
          event_start: event.start_time,
          attendees,
          status: "generating",
        })
        .select()
        .single();

      if (insertErr || !brief) {
        errors.push({ eventId: event.id, error: "Failed to create brief record" });
        continue;
      }

      // Call edge function
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        await admin
          .from("meeting_briefs")
          .update({ status: "failed" })
          .eq("id", brief.id as string);
        errors.push({ eventId: event.id, error: "Server configuration error" });
        continue;
      }

      const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-meeting-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          eventTitle: event.title,
          eventStart: event.start_time,
          attendees: attendeeContexts,
        }),
      });

      if (!efRes.ok) {
        await admin
          .from("meeting_briefs")
          .update({ status: "failed" })
          .eq("id", brief.id as string);
        errors.push({ eventId: event.id, error: `AI error (${efRes.status})` });
        continue;
      }

      const efData = (await efRes.json()) as { briefContent?: string };
      if (!efData.briefContent) {
        await admin
          .from("meeting_briefs")
          .update({ status: "failed" })
          .eq("id", brief.id as string);
        errors.push({ eventId: event.id, error: "Empty AI response" });
        continue;
      }

      await admin
        .from("meeting_briefs")
        .update({
          brief_content: efData.briefContent,
          status: "ready",
          generated_at: new Date().toISOString(),
        })
        .eq("id", brief.id as string);

      generated.push(event.id);
    } catch (e) {
      errors.push({
        eventId: event.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    generated: generated.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
