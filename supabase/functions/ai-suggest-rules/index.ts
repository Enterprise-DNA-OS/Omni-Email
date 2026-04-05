import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface DetectedPattern {
  signalType: string;
  senderDomain: string | null;
  senderAddress: string | null;
  count: number;
  exampleSubjects: string[];
}

interface RuleSuggestion {
  description: string;
  condition: string;
  action: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface SuggestRulesRequest {
  patterns: DetectedPattern[];
}

const SYSTEM_PROMPT = `You are an email automation assistant. Based on observed user behavior patterns, suggest automation rules that would save the user time.

Each pattern describes an action the user has taken repeatedly on emails from the same sender.

Return a JSON object with a "suggestions" array. Each suggestion must have:
- "description": A short, human-readable rule name (e.g. "Auto-archive newsletters from acme.com")
- "condition": The trigger condition in plain English (e.g. "Email arrives from @newsletter.acme.com")
- "action": The action to take in plain English (e.g. "Archive immediately and mark as read")
- "confidence": "high" if the pattern is very clear (10+ occurrences, consistent behavior), "medium" if moderate, "low" if speculative
- "reasoning": One sentence explaining why this rule would help

Rules:
- Only suggest rules for patterns with 5 or more occurrences
- Prefer domain-level rules over exact-address rules when the domain is consistent
- Do not suggest rules that would delete emails unless the pattern is overwhelmingly clear
- Return ONLY valid JSON, no markdown
- Maximum 8 suggestions`;

const VALID_CONFIDENCE = ["high", "medium", "low"];

function parseSuggestions(raw: string): RuleSuggestion[] {
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { suggestions?: unknown[] };
    if (!Array.isArray(parsed.suggestions)) return [];

    return parsed.suggestions
      .filter(
        (s): s is Record<string, unknown> =>
          typeof s === "object" && s !== null,
      )
      .map((s) => ({
        description: typeof s.description === "string" ? s.description.slice(0, 200) : "",
        condition: typeof s.condition === "string" ? s.condition.slice(0, 300) : "",
        action: typeof s.action === "string" ? s.action.slice(0, 200) : "",
        confidence: VALID_CONFIDENCE.includes(s.confidence as string)
          ? (s.confidence as "high" | "medium" | "low")
          : "low",
        reasoning: typeof s.reasoning === "string" ? s.reasoning.slice(0, 300) : "",
      }))
      .filter((s) => s.description && s.condition && s.action)
      .slice(0, 8);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: SuggestRulesRequest;
  try {
    payload = (await req.json()) as SuggestRulesRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!Array.isArray(payload.patterns) || payload.patterns.length === 0) {
    return Response.json({ suggestions: [] }, { headers: CORS_HEADERS });
  }

  // Format patterns for the prompt
  const patternSummary = payload.patterns
    .map((p, i) => {
      const sender = p.senderAddress ?? p.senderDomain ?? "unknown sender";
      const subjects = p.exampleSubjects.length
        ? `\n  Example subjects: ${p.exampleSubjects.join("; ")}`
        : "";
      return `${i + 1}. User "${p.signalType}" ${p.count} times for emails from ${sender}${subjects}`;
    })
    .join("\n");

  try {
    const raw = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here are the detected behavior patterns:\n\n${patternSummary}\n\nSuggest automation rules.`,
        },
      ],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const suggestions = parseSuggestions(raw);
    return Response.json({ suggestions }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
