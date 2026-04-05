import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `You are an AI email assistant for Omni Email. Your job is to help the user understand and act on their inbox.

You have access to relevant emails from the user's inbox (provided as search results). Use them to answer questions accurately and concisely.

Guidelines:
- Answer questions about the user's emails using the search results provided.
- When referencing a specific email or thread, note its thread_id so the UI can link to it.
- For action commands, return structured actions in the actions array (see action types below).
- Keep responses concise and professional. Avoid markdown formatting unless it aids clarity.
- If the search results don't contain enough information to answer confidently, say so clearly.
- Never make up email content — only use what is in the provided context.
- For "summarize today" or daily summary requests, use action type "daily_summary".
- For rule creation requests, construct a well-formed rule from what the user described and use action type "create_rule".
- For draft/compose/reply requests, use action type "create_draft" — include the recipient, subject, and a draft body in params.
- For snooze requests, parse natural language time ("tomorrow", "in 3 days", "next Monday") into an ISO-8601 timestamp and use action type "snooze".
- For tag requests, use action type "tag" with tagName and threadId.
- For forward requests, use action type "forward" with toEmail and threadId.
- For settings changes ("turn on CEO mode", "set threshold"), use action type "update_settings" with settingKey and settingValue.
- For follow-up reminders, use action type "set_followup" with threadId and snoozeUntil (ISO-8601).
- When the user asks to "create a rule", generate a complete rule definition with conditions and actions based on their description.

Response format: Return a JSON object with:
- "response": string — your conversational reply to the user
- "threadRefs": string[] — array of thread_ids you referenced (empty array if none)
- "actions": array of action objects (empty array if no actions proposed)

Action types and their params:

Basic thread actions (threadId required):
- type "archive": {}
- type "mark_read": {}
- type "mark_unread": {}
- type "star": {}
- type "delete": {}
- type "label": { "label": string }
- type "snooze": { "until": ISO-8601 string }
- type "tag": { "tagName": string }
- type "forward": { "toEmail": string }
- type "set_followup": { "snoozeUntil": ISO-8601 string }

Non-thread actions (threadId omitted or empty):
- type "create_rule": {
    "name": string,
    "conditions": [{ "field": string, "operator": string, "value": string, "logic": "AND"|"OR" }],
    "actions": [{ "type": string, "params": object }],
    "enabled": true
  }
- type "create_draft": {
    "to": string,
    "subject": string,
    "bodyText": string,
    "threadId"?: string  (if replying to an existing thread)
  }
- type "update_settings": {
    "settingKey": string,
    "settingValue": string|number|boolean
  }
- type "daily_summary": {}

For "create_rule", valid condition fields: sender_email, sender_domain, subject, body, ai_category, ai_priority, ai_intent, has_attachments, is_first_time_sender.
Valid condition operators: equals, not_equals, contains, starts_with, ends_with, matches_regex, in_list.
Valid rule action types: apply_tag, archive, delete, forward, star, set_priority, mark_vip, auto_reply, suppress_ai.

Each action object always has:
- "type": one of the types listed above
- "threadId": string (thread to act on, or empty string for non-thread actions)
- "params": object — additional parameters as described above
- "description": string — human-readable description shown to the user before they approve

Return ONLY valid JSON, no markdown.`;

interface SearchResult {
  thread_id: string;
  subject: string;
  sender: string;
  snippet: string;
  similarity: number;
  message_body?: string;
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  context?: string;
  searchResults?: SearchResult[];
  chatHistory?: ChatHistoryMessage[];
}

interface ChatAction {
  type: string;
  threadId?: string;
  params: Record<string, unknown>;
  description: string;
}

interface ChatResult {
  response: string;
  actions: ChatAction[];
  threadRefs: string[];
}

function buildSearchContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No relevant emails found in search results.";
  }
  return results
    .map((r, i) => {
      const body = r.message_body ? `\nBody excerpt: ${r.message_body.slice(0, 400)}` : "";
      return `[${i + 1}] Thread ID: ${r.thread_id}\nSubject: ${r.subject}\nFrom: ${r.sender}\nSnippet: ${r.snippet}${body}`;
    })
    .join("\n\n---\n\n");
}

function parseResponse(raw: string): ChatResult {
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<ChatResult>;
    return {
      response: typeof parsed.response === "string" ? parsed.response : raw,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      threadRefs: Array.isArray(parsed.threadRefs) ? parsed.threadRefs : [],
    };
  } catch {
    // If JSON parse fails, treat the entire output as a plain text response
    return { response: raw, actions: [], threadRefs: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: ChatRequest;
  try {
    payload = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { message, context, searchResults = [], chatHistory = [] } = payload;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json(
      { error: "message is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Build the user turn content
  const searchContext = buildSearchContext(searchResults);
  const userContent = [
    context ? `Context: ${context}` : "",
    `Relevant emails from inbox:\n${searchContext}`,
    `User message: ${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Assemble conversation: inject history for continuity (last 10 turns)
  const historyMessages = chatHistory.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const raw = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        ...historyMessages,
        { role: "user", content: userContent },
      ],
      max_tokens: 1200,
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
