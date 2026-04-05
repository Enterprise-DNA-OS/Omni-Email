import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `You are a cold email classifier. Your job is to determine whether an incoming email is an unsolicited cold outreach email — meaning the sender has no prior relationship with the recipient and is initiating contact for sales, marketing, or promotional purposes.

Return a JSON object with exactly these fields:
- "isColdEmail": boolean — true if this is an unsolicited cold outreach email
- "confidence": number between 0.0 and 1.0
- "reasoning": one sentence explaining the primary signal that drove your decision
- "signals": array of strings — specific patterns detected (see valid signals below)

Valid signal strings (use only these):
- "no_prior_contact" — sender has never messaged this user before
- "sales_language" — explicit sales pitch, demo request, pricing mention, or commercial offer
- "bulk_patterns" — templated phrasing, mail merge artifacts, or mass-send indicators
- "unsubscribe_link" — contains an unsubscribe or opt-out link
- "generic_greeting" — addresses recipient by first name only with no personal context, or uses "Hi there"
- "promotional_content" — discount offers, trial invitations, or product announcements
- "outreach_sequence" — references being a follow-up or part of a sequence ("just following up", "wanted to circle back")
- "vendor_pitch" — company introducing a product/service the recipient did not request
- "networking_cold" — LinkedIn-style outreach from a stranger asking to connect for mutual benefit

Rules:
- Transactional emails (receipts, invoices, account alerts, password resets) are NOT cold emails — return false
- Newsletter subscriptions the user opted into are borderline; lean toward false unless clearly cold
- Personal emails from individuals known to the user are NOT cold emails
- Legal notices, compliance emails, and government communications are NOT cold emails
- Internal company emails are NOT cold emails
- If the sender has prior message history (senderHistory > 0), set isColdEmail to false unless signals are extremely strong
- Return ONLY valid JSON, no markdown or explanation`;

interface ColdEmailRequest {
  senderEmail: string;
  subject: string;
  bodySnippet: string;
  senderHistory: number; // count of prior messages from this sender to this user
  customCriteria?: string;
}

interface ColdEmailResult {
  isColdEmail: boolean;
  confidence: number;
  reasoning: string;
  signals: string[];
}

const VALID_SIGNALS = [
  "no_prior_contact",
  "sales_language",
  "bulk_patterns",
  "unsubscribe_link",
  "generic_greeting",
  "promotional_content",
  "outreach_sequence",
  "vendor_pitch",
  "networking_cold",
];

function parseResponse(raw: string): ColdEmailResult {
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<ColdEmailResult>;

    const isColdEmail = typeof parsed.isColdEmail === "boolean" ? parsed.isColdEmail : false;
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5;
    const reasoning =
      typeof parsed.reasoning === "string" ? parsed.reasoning : "";
    const signals = Array.isArray(parsed.signals)
      ? (parsed.signals as string[])
          .filter((s): s is string => typeof s === "string" && VALID_SIGNALS.includes(s))
          .slice(0, 9)
      : [];

    return { isColdEmail, confidence, reasoning, signals };
  } catch {
    return {
      isColdEmail: false,
      confidence: 0.5,
      reasoning: "Could not parse AI response",
      signals: [],
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: ColdEmailRequest;
  try {
    payload = (await req.json()) as ColdEmailRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { senderEmail, subject, bodySnippet, senderHistory, customCriteria } = payload;
  if (!senderEmail || subject == null || bodySnippet == null || senderHistory == null) {
    return Response.json(
      { error: "senderEmail, subject, bodySnippet, and senderHistory are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const systemPrompt = customCriteria
    ? `${SYSTEM_PROMPT}\n\nAdditional user-defined criteria to consider:\n${customCriteria}`
    : SYSTEM_PROMPT;

  const userContent = [
    `Sender: ${senderEmail}`,
    `Prior messages from this sender: ${senderHistory}`,
    `Subject: ${subject}`,
    `Body snippet:\n${bodySnippet.slice(0, 1200)}`,
  ].join("\n\n");

  try {
    const raw = await callOpenRouter({
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const result = parseResponse(raw);
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
