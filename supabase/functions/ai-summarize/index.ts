import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT =
  "You are an email assistant. Summarize the following email thread concisely in 2-3 sentences. Focus on: who is involved, what the topic is, what action items or decisions exist, and the current status.";

interface IncomingMessage {
  sender: string;
  body: string;
  date?: string;
}

interface SummarizeRequest {
  subject?: string;
  messages: IncomingMessage[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: SummarizeRequest;
  try {
    payload = (await req.json()) as SummarizeRequest;
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
    .map((m) => {
      const dateLine = m.date ? `Date: ${m.date}\n` : "";
      return `From: ${m.sender ?? "Unknown"}\n${dateLine}${m.body ?? ""}\n---`;
    })
    .join("\n\n");

  const subjectLine = payload.subject ? `Thread subject: ${payload.subject}\n\n` : "";

  try {
    const summary = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${subjectLine}${formatted}`,
        },
      ],
      max_tokens: 300,
    });
    return Response.json({ summary }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
