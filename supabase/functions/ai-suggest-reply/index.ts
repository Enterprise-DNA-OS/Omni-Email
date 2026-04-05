import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

// SYNC NOTE: The Tone type and VALID_TONES list below must stay in sync with
// ReplyMode and REPLY_MODE_PROMPTS in lib/ai/reply-modes.ts (Node.js runtime).
// Both must have exactly the same 11 tones. When adding or removing a tone,
// update BOTH files: this edge function (Deno) and lib/ai/reply-modes.ts (Node.js).
// Current tones (11): professional, friendly, brief, concise, warm, executive,
//                     support, sales, legal_safe, detailed, casual

type Tone =
  | "professional"
  | "friendly"
  | "brief"
  | "concise"
  | "warm"
  | "executive"
  | "support"
  | "sales"
  | "legal_safe"
  | "detailed"
  | "casual";

const VALID_TONES: Tone[] = [
  "professional",
  "friendly",
  "brief",
  "concise",
  "warm",
  "executive",
  "support",
  "sales",
  "legal_safe",
  "detailed",
  "casual",
];

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: "Be polished and business-appropriate without being overly formal.",
  friendly: "Be warm, approachable, and personable.",
  brief: "Keep the reply under 3 sentences — be direct and to the point.",
  concise: "Be clear and succinct. No padding or filler phrases.",
  warm: "Express genuine care and empathy. Be supportive and encouraging.",
  executive: "Be authoritative and decisive. Use short sentences. Lead with the key point.",
  support: "Be helpful, patient, and empathetic. Acknowledge the issue before offering a solution.",
  sales:
    "Be confident and value-focused. Highlight benefits. Include a clear call to action.",
  legal_safe:
    "Be precise and non-committal where appropriate. Avoid admissions or promises. Use measured language.",
  detailed:
    "Be thorough. Address every point raised. Use numbered lists if helpful.",
  casual: "Write as you would to a friend or close colleague. Relaxed grammar is fine.",
};

interface IncomingMessage {
  sender: string;
  body: string;
}

interface SuggestReplyRequest {
  subject?: string;
  messages: IncomingMessage[];
  tone?: string;
  customInstruction?: string;
  writingStyleProfile?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: SuggestReplyRequest;
  try {
    payload = (await req.json()) as SuggestReplyRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const tone: Tone = VALID_TONES.includes(payload.tone as Tone)
    ? (payload.tone as Tone)
    : "professional";

  const toneInstruction = TONE_INSTRUCTIONS[tone];

  // Validate and sanitise the optional custom instruction (max 500 chars)
  const customInstruction =
    payload.customInstruction && typeof payload.customInstruction === "string"
      ? payload.customInstruction.trim().slice(0, 500)
      : "";

  // Validate and sanitise the optional writing style profile (max 1000 chars)
  const writingStyleProfile =
    payload.writingStyleProfile && typeof payload.writingStyleProfile === "string"
      ? payload.writingStyleProfile.trim().slice(0, 1000)
      : "";

  const systemPrompt =
    `You are an email assistant. Draft a reply to the following email thread. ` +
    `Tone: ${tone}. ${toneInstruction} ` +
    (writingStyleProfile
      ? `Writing style to match: ${writingStyleProfile} `
      : "") +
    (customInstruction ? `Additional instruction: ${customInstruction} ` : "") +
    `Write ONLY the reply body — no subject line, no greeting like "Dear X", no sign-off or signature. ` +
    `Return only the body paragraphs, ready to paste.`;

  const formatted = payload.messages
    .map((m) => `From: ${m.sender ?? "Unknown"}\n${m.body ?? ""}\n---`)
    .join("\n\n");

  const subjectLine = payload.subject ? `Thread subject: ${payload.subject}\n\n` : "";

  try {
    const reply = await callOpenRouter({
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${subjectLine}${formatted}\n\nDraft a ${tone} reply to the most recent message.`,
        },
      ],
      max_tokens: 500,
    });
    return Response.json({ reply }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
