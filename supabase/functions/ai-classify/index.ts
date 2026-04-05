import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `You are an AI email analyst for a business professional. Analyze the email thread and return a JSON object with these fields:

- "summary": A 1-2 sentence summary. Be specific: mention names, companies, action items, deadlines.
- "category": One of: "client", "billing", "support", "notification", "marketing", "internal", "personal", "security", "scheduling", "legal", "other"
- "priority": One of: "urgent" (needs response today), "high" (needs response soon), "normal" (routine), "low" (FYI only), "ignore" (automated/spam/marketing noise)
- "tags": 1-4 short descriptive tags relevant to the content (e.g. ["invoice", "overdue", "acme-corp"])
- "intent": The single most appropriate next action for this email. One of: "reply", "reply_urgent", "archive", "delete", "delegate", "schedule", "pay", "review", "ignore", "unsubscribe", "follow_up", "no_action"
- "confidence": A float between 0.0 and 1.0 indicating how confident you are in this classification.
- "reasoning": One sentence explaining the most important factor that drove your classification.
- "signals": An array of risk or opportunity signals detected in this thread. Each element: { "type": "risk" | "opportunity", "signal": string (concise description), "severity": "high" | "medium" | "low" }. Return an empty array if none are present.

Signal detection rules:
- Risk signals: payment overdue notices, contract disputes, legal threats, compliance deadlines, security breaches, customer escalations, SLA violations, employee issues, negative press mentions
- Opportunity signals: new business inquiries, upsell requests, partnership proposals, referrals, positive feedback from key clients, budget approval for new work, renewal discussions
- Only include signals that are clearly present in the email — do not speculate
- Assign "high" severity to time-sensitive or financially significant signals

Rules:
- Automated notifications, alerts, and marketing emails are "low" or "ignore" priority.
- Emails requiring a reply or action are "high" or "urgent".
- Tags should be lowercase, hyphenated, and specific to the content.
- "intent" should reflect what the recipient should do next, not what the sender did.
- Return ONLY valid JSON, no markdown or explanation.`;

interface IncomingMessage {
  sender: string;
  body: string;
}

interface ClassifyRequest {
  subject: string;
  messages: IncomingMessage[];
}

interface AiSignal {
  type: "risk" | "opportunity";
  signal: string;
  severity: "high" | "medium" | "low";
}

interface ClassifyResult {
  summary: string;
  category: string;
  priority: "urgent" | "high" | "normal" | "low" | "ignore";
  tags: string[];
  intent: string;
  confidence: number;
  reasoning: string;
  signals: AiSignal[];
}

const VALID_PRIORITIES = ["urgent", "high", "normal", "low", "ignore"];
const VALID_INTENTS = [
  "reply",
  "reply_urgent",
  "archive",
  "delete",
  "delegate",
  "schedule",
  "pay",
  "review",
  "ignore",
  "unsubscribe",
  "follow_up",
  "no_action",
];

function parseResponse(raw: string): ClassifyResult {
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<ClassifyResult>;

    if (!parsed.summary || !parsed.category || !parsed.priority) {
      throw new Error("Missing required fields");
    }
    if (!VALID_PRIORITIES.includes(parsed.priority)) {
      parsed.priority = "normal";
    }
    if (!Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }
    parsed.tags = (parsed.tags as string[])
      .slice(0, 4)
      .map((t) => String(t).toLowerCase().replace(/\s+/g, "-"));

    if (!parsed.intent || !VALID_INTENTS.includes(parsed.intent)) {
      parsed.intent = "no_action";
    }
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    parsed.confidence = Math.min(1, Math.max(0, confidence));
    if (!parsed.reasoning || typeof parsed.reasoning !== "string") {
      parsed.reasoning = "";
    }

    // Validate signals array
    const VALID_SIGNAL_TYPES = ["risk", "opportunity"];
    const VALID_SEVERITIES = ["high", "medium", "low"];
    if (!Array.isArray((parsed as Partial<ClassifyResult>).signals)) {
      (parsed as Partial<ClassifyResult>).signals = [];
    }
    (parsed as Partial<ClassifyResult>).signals = (
      (parsed as Partial<ClassifyResult>).signals as AiSignal[]
    )
      .filter(
        (s): s is AiSignal =>
          typeof s === "object" &&
          s !== null &&
          VALID_SIGNAL_TYPES.includes(s.type) &&
          typeof s.signal === "string" &&
          s.signal.length > 0 &&
          VALID_SEVERITIES.includes(s.severity),
      )
      .slice(0, 10);

    return parsed as ClassifyResult;
  } catch {
    return {
      summary: raw.slice(0, 300),
      category: "other",
      priority: "normal",
      tags: [],
      intent: "no_action",
      confidence: 0.5,
      reasoning: "",
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

  let payload: ClassifyRequest;
  try {
    payload = (await req.json()) as ClassifyRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { subject, messages } = payload;
  if (!subject || !Array.isArray(messages)) {
    return Response.json(
      { error: "subject and messages are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const formatted = messages
    .map((m) => `From: ${m.sender ?? "Unknown"}\n${m.body ?? ""}\n---`)
    .join("\n\n");

  try {
    const raw = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Thread subject: ${subject}\n\n${formatted}`,
        },
      ],
      max_tokens: 400,
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
