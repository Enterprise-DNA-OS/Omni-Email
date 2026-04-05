/**
 * Shared OpenRouter client for Supabase Edge Functions.
 * All LLM calls in this project go through OpenRouter so that the model
 * can be changed by updating a single string rather than touching code.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5.4";
const APP_URL = "https://omni.email";
const APP_TITLE = "Omni Email";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterParams {
  /** OpenRouter model string — default: anthropic/claude-sonnet-4-20250514 */
  model?: string;
  /** System prompt (convenience — prepended as a system message) */
  system?: string;
  /** Conversation messages */
  messages: ChatMessage[];
  /** Max tokens to generate */
  max_tokens?: number;
  /**
   * Optional JSON schema for structured output.
   * Pass `{ type: "json_object" }` to force a valid JSON response.
   */
  response_format?: { type: "json_object" | "text" };
}

/**
 * Call OpenRouter and return the text content of the first choice.
 * Reads OPENROUTER_API_KEY from Deno.env — must be set as a Supabase secret.
 */
export async function callOpenRouter(params: OpenRouterParams): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY secret is not set");
  }

  const messages: ChatMessage[] = [];
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  messages.push(...params.messages);

  const body: Record<string, unknown> = {
    model: params.model ?? DEFAULT_MODEL,
    messages,
    max_tokens: params.max_tokens ?? 500,
  };
  if (params.response_format) {
    body.response_format = params.response_format;
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": APP_URL,
      "X-Title": APP_TITLE,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (content == null) {
    throw new Error("OpenRouter returned an empty response");
  }
  return content;
}

/** Standard CORS headers for Supabase Edge Functions. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
