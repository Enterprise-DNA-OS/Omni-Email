import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface FollowUpRequest {
  subject: string;
  originalBody: string;
  followUpCount: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: FollowUpRequest;
  try {
    payload = (await req.json()) as FollowUpRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!payload.subject || typeof payload.subject !== "string") {
    return Response.json(
      { error: "subject is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (!payload.originalBody || typeof payload.originalBody !== "string") {
    return Response.json(
      { error: "originalBody is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const followUpCount = typeof payload.followUpCount === "number" && payload.followUpCount > 0
    ? payload.followUpCount
    : 1;

  const systemPrompt =
    `Generate a polite follow-up email. This is follow-up #${followUpCount}. ` +
    `Be brief and professional. Reference the original topic without repeating the full email. ` +
    `Write ONLY the email body — no subject line, no greeting like "Dear X", no sign-off or signature. ` +
    `Return only the body paragraphs, ready to paste.`;

  const userContent =
    `Original email subject: ${payload.subject}\n\n` +
    `Original email body:\n${payload.originalBody.slice(0, 2000)}\n\n` +
    `Write follow-up #${followUpCount}.`;

  try {
    const followUp = await callOpenRouter({
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      max_tokens: 400,
    });
    return Response.json({ followUp }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
