import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT =
  "You are an email writing assistant. Improve the following email draft for clarity, tone, and professionalism. " +
  "Preserve the original intent and all key points. " +
  "Return ONLY the improved text — no explanations, preamble, or commentary.";

interface ImproveRequest {
  text: string;
  instruction?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: ImproveRequest;
  try {
    payload = (await req.json()) as ImproveRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const text = payload.text?.trim() ?? "";
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const instruction = payload.instruction?.trim() ?? "";
  const userContent = `Original draft:\n${text}${instruction ? `\n\nAdditional instruction: ${instruction}` : ""}`;

  try {
    const improved = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      // Token budget: original text length / ~4 chars per token, plus a generous buffer
      max_tokens: Math.min(2000, Math.max(300, Math.ceil(text.length / 4) + 300)),
    });
    return Response.json({ improved }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
