import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  sender: string;
  body: string;
  sentAt: string;
}

interface ContactRecord {
  id: string;
  name: string | null;
  email: string;
  relationship_score: number | null;
  message_count_in: number;
  message_count_out: number;
  last_inbound_at: string | null;
  avg_response_time_hours: number | null;
}

interface InteractionThread {
  id: string;
  subject: string | null;
  snippet: string | null;
  last_message_at: string | null;
}

interface PendingTask {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
}

interface ContextDraftRequest {
  subject: string;
  messages: Message[];
  contact?: ContactRecord | null;
  recentInteractions?: InteractionThread[];
  writingStyleProfile?: string | null;
  pendingTasks?: PendingTask[];
  upcomingEvents?: UpcomingEvent[];
  senderEmail?: string | null;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  contact: ContactRecord | null | undefined,
  writingStyleProfile: string | null | undefined,
): string {
  let prompt =
    `You are an expert email assistant generating a highly personalised reply draft. ` +
    `Use all available context to craft a reply that is relevant, warm, and actionable. ` +
    `Write ONLY the reply body — no subject line, no greeting ("Dear X"), no sign-off or signature. ` +
    `Return only the body paragraphs, ready to paste. ` +
    `After the draft, on a new line starting with "NEXT_STEPS:", list up to 3 short suggested ` +
    `follow-up actions separated by "|" (e.g. "Schedule call | Send proposal | Update task"). ` +
    `If no next steps are needed, omit the NEXT_STEPS line entirely.`;

  if (writingStyleProfile) {
    prompt += ` Adopt this writing style: ${writingStyleProfile.slice(0, 500)}`;
  }

  if (contact) {
    const score = contact.relationship_score;
    const messageCount = contact.message_count_in + contact.message_count_out;
    prompt +=
      ` Context about the sender: name="${contact.name ?? "unknown"}", ` +
      `email="${contact.email}", ` +
      `relationship_score=${score !== null ? score.toFixed(0) : "n/a"}/100, ` +
      `total_messages_exchanged=${messageCount}.`;
    if (contact.avg_response_time_hours !== null) {
      prompt += ` Typical response time: ${contact.avg_response_time_hours.toFixed(1)} hours.`;
    }
  }

  return prompt;
}

function buildUserPrompt(req: ContextDraftRequest): string {
  const lines: string[] = [];

  lines.push(`Thread subject: ${req.subject}`);
  lines.push("");

  // Thread messages
  lines.push("--- Thread ---");
  for (const m of req.messages) {
    lines.push(`From: ${m.sender} (${m.sentAt})`);
    lines.push(m.body.slice(0, 1500));
    lines.push("---");
  }
  lines.push("");

  // Recent interaction threads
  if (req.recentInteractions && req.recentInteractions.length > 0) {
    lines.push("Recent threads with this contact:");
    for (const t of req.recentInteractions) {
      lines.push(
        `- "${t.subject}" (last message: ${t.last_message_at ?? "unknown"})` +
          (t.snippet ? ` — ${t.snippet}` : ""),
      );
    }
    lines.push("");
  }

  // Pending tasks
  if (req.pendingTasks && req.pendingTasks.length > 0) {
    lines.push("Pending tasks related to this contact:");
    for (const t of req.pendingTasks) {
      lines.push(`- ${t.title} (status: ${t.status}${t.due_at ? `, due: ${t.due_at}` : ""})`);
    }
    lines.push("");
  }

  // Upcoming events
  if (req.upcomingEvents && req.upcomingEvents.length > 0) {
    lines.push("Upcoming events with this contact:");
    for (const e of req.upcomingEvents) {
      lines.push(`- ${e.title} at ${e.start_at}`);
    }
    lines.push("");
  }

  lines.push("Now draft a context-aware reply to the most recent message.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Parse next steps from the model output
// ---------------------------------------------------------------------------

function parseModelOutput(raw: string): { draft: string; suggestedNextSteps: string[] } {
  const nextStepsMarker = "NEXT_STEPS:";
  const idx = raw.indexOf(nextStepsMarker);

  if (idx === -1) {
    return { draft: raw.trim(), suggestedNextSteps: [] };
  }

  const draft = raw.slice(0, idx).trim();
  const nextStepsLine = raw.slice(idx + nextStepsMarker.length).trim();
  const suggestedNextSteps = nextStepsLine
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return { draft, suggestedNextSteps };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: ContextDraftRequest;
  try {
    payload = (await req.json()) as ContextDraftRequest;
  } catch {
    return Response.json(
      { error: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!payload.subject) {
    return Response.json(
      { error: "subject is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const systemPrompt = buildSystemPrompt(payload.contact, payload.writingStyleProfile);
  const userPrompt = buildUserPrompt(payload);

  try {
    const raw = await callOpenRouter({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 800,
    });

    const { draft, suggestedNextSteps } = parseModelOutput(raw);

    return Response.json({ draft, suggestedNextSteps }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
