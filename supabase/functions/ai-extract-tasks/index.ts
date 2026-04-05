import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface IncomingMessage {
  sender: string;
  body: string;
}

interface ExtractTasksRequest {
  subject?: string;
  messages: IncomingMessage[];
}

interface ExtractedTask {
  description: string;
  deadline: string | null;
  assignee: string | null;
}

const SYSTEM_PROMPT =
  `You are an email assistant that extracts concrete action items and tasks from email threads. ` +
  `Identify only explicit, actionable tasks — things that need to be done by someone. ` +
  `Do not include vague statements, opinions, or general discussion points. ` +
  `For each task, extract: ` +
  `1. "description" — a clear, imperative description of the action (e.g. "Send the Q2 report to finance team") ` +
  `2. "deadline" — an ISO 8601 datetime string if a specific date/time is mentioned, otherwise null ` +
  `3. "assignee" — the name or email of the person responsible if explicitly mentioned, otherwise null ` +
  `Return a JSON object with a "tasks" array. If there are no clear action items, return {"tasks": []}. ` +
  `Return only valid JSON — no markdown, no explanation.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: ExtractTasksRequest;
  try {
    payload = (await req.json()) as ExtractTasksRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const formatted = payload.messages
    .map((m) => `From: ${m.sender ?? "Unknown"}\n${m.body ?? ""}\n---`)
    .join("\n\n");

  const subjectLine = payload.subject ? `Thread subject: ${payload.subject}\n\n` : "";

  try {
    const raw = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${subjectLine}${formatted}\n\nExtract all action items and tasks from this thread.`,
        },
      ],
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    // Parse and validate the response
    let parsed: { tasks?: unknown[] };
    try {
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned) as { tasks?: unknown[] };
    } catch {
      return Response.json({ tasks: [] }, { headers: CORS_HEADERS });
    }

    if (!Array.isArray(parsed.tasks)) {
      return Response.json({ tasks: [] }, { headers: CORS_HEADERS });
    }

    const tasks: ExtractedTask[] = parsed.tasks
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        description:
          typeof item.description === "string" ? item.description.trim() : "",
        deadline:
          typeof item.deadline === "string" && item.deadline
            ? item.deadline
            : null,
        assignee:
          typeof item.assignee === "string" && item.assignee
            ? item.assignee.trim()
            : null,
      }))
      .filter((t) => t.description.length > 0);

    return Response.json({ tasks }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
