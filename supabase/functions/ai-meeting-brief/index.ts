import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface AttendeeContext {
  name: string;
  email: string;
  recentThreadSummaries: string[];
  openActionItems: string[];
}

interface MeetingBriefRequest {
  eventTitle: string;
  eventStart: string;
  attendees: AttendeeContext[];
  organizerNote?: string;
}

const SYSTEM_PROMPT =
  `You are an executive assistant preparing a concise pre-meeting briefing. ` +
  `Your output will be read right before the meeting starts, so it must be ` +
  `immediately actionable and scannable. ` +
  `Structure the briefing as plain text with clearly labelled sections: ` +
  `MEETING OVERVIEW, ATTENDEES, RECENT EMAIL CONTEXT, TALKING POINTS, and OPEN ITEMS. ` +
  `For ATTENDEES, provide a 1-2 sentence profile for each person based on available context. ` +
  `For RECENT EMAIL CONTEXT, summarise the most relevant email exchanges with attendees. ` +
  `For TALKING POINTS, suggest 3-5 concrete topics worth raising. ` +
  `For OPEN ITEMS, list unresolved action items related to the attendees. ` +
  `Keep each section concise — the full brief should be under 400 words. ` +
  `Use plain text only — no markdown, no bullet symbols, no asterisks. ` +
  `Use numbered lists for talking points and open items. ` +
  `Write in second person ("you", "your").`;

function formatBriefContext(req: MeetingBriefRequest): string {
  const lines: string[] = [];

  lines.push(`Meeting: ${req.eventTitle}`);
  lines.push(`Scheduled: ${new Date(req.eventStart).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`);
  lines.push(`Attendees: ${req.attendees.length}`);

  if (req.organizerNote) {
    lines.push(`Organizer note: ${req.organizerNote}`);
  }

  lines.push("");

  for (const attendee of req.attendees) {
    lines.push(`Attendee: ${attendee.name} <${attendee.email}>`);

    if (attendee.recentThreadSummaries.length > 0) {
      lines.push("  Recent email threads:");
      for (const summary of attendee.recentThreadSummaries.slice(0, 3)) {
        lines.push(`    - ${summary}`);
      }
    } else {
      lines.push("  Recent email threads: none found");
    }

    if (attendee.openActionItems.length > 0) {
      lines.push("  Open action items:");
      for (const item of attendee.openActionItems.slice(0, 3)) {
        lines.push(`    - ${item}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: MeetingBriefRequest;
  try {
    payload = (await req.json()) as MeetingBriefRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!payload.eventTitle || !payload.eventStart) {
    return Response.json(
      { error: "eventTitle and eventStart are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!Array.isArray(payload.attendees)) {
    return Response.json(
      { error: "attendees must be an array" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const formattedContext = formatBriefContext(payload);

  try {
    const briefContent = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the context for my upcoming meeting:\n\n${formattedContext}\n\nWrite my pre-meeting briefing.`,
        },
      ],
      max_tokens: 700,
    });

    return Response.json({ briefContent }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
