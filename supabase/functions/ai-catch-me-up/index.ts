import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface ThreadSummary {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  priority: string;
  intent: string;
  lastMessageAt: string;
}

interface CatchMeUpContext {
  urgentThreads: ThreadSummary[];
  needsDecision: ThreadSummary[];
  updates: ThreadSummary[];
  autoHandled: number;
  pendingApprovals: number;
  stats: {
    totalNew: number;
    sinceLabel: string;
  };
}

interface CatchMeUpRequest {
  context: CatchMeUpContext;
}

const SYSTEM_PROMPT =
  "You are an executive email assistant giving a concise briefing. " +
  "Summarize what happened while the user was away in a clear, narrative style. " +
  "Be direct — lead with the most important point. " +
  "Do not use markdown headers or bullet points. Write in plain prose paragraphs. " +
  "End with a practical estimate of how long it will take to clear the inbox (e.g. '~15 minutes to clear').";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: CatchMeUpRequest;
  try {
    payload = (await req.json()) as CatchMeUpRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!payload.context) {
    return Response.json(
      { error: "context is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { urgentThreads, needsDecision, updates, autoHandled, pendingApprovals, stats } =
    payload.context;

  const urgentLines = urgentThreads
    .map((t) => `- [URGENT] "${t.subject}" from ${t.sender}: ${t.snippet}`)
    .join("\n");

  const decisionLines = needsDecision
    .map((t) => `- [DECISION NEEDED] "${t.subject}" from ${t.sender}: ${t.snippet}`)
    .join("\n");

  const updateLines = updates
    .map((t) => `- "${t.subject}" from ${t.sender}: ${t.snippet}`)
    .join("\n");

  const userMessage =
    `The user has been away. Here is what happened since ${stats.sinceLabel}:\n\n` +
    `Total new emails: ${stats.totalNew}\n` +
    `Pending approvals waiting for user: ${pendingApprovals}\n` +
    `Auto-handled by AI (no action needed): ${autoHandled}\n\n` +
    (urgentLines ? `Urgent threads requiring immediate attention:\n${urgentLines}\n\n` : "") +
    (decisionLines ? `Threads needing a decision:\n${decisionLines}\n\n` : "") +
    (updateLines ? `Other important updates:\n${updateLines}\n\n` : "") +
    "Write a concise briefing for the user. End with an estimated clear time.";

  try {
    const narrative = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 500,
    });

    // Extract estimated clear time from the narrative (last sentence pattern)
    const clearTimeMatch = narrative.match(/~?\d+[\s\-–]*(minute|hour|min|hr)s?[^.]*\./i);
    const estimatedClearTime = clearTimeMatch ? clearTimeMatch[0].trim() : null;

    return Response.json(
      { narrative, estimatedClearTime },
      { headers: CORS_HEADERS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
