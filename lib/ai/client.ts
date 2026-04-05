/**
 * AI client — Next.js side.
 *
 * All LLM calls are delegated to Supabase Edge Functions, which hold the
 * OPENROUTER_API_KEY secret and call OpenRouter on our behalf.
 * No AI keys are stored in .env.local.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function edgeFunctionUrl(name: string): string {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

async function callEdgeFunction<T>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  const res = await fetch(edgeFunctionUrl(functionName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI service error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Legacy interface — kept so existing callers (classify.ts, API routes) don't
 * need to change until they are refactored to call edge functions directly.
 *
 * Maps the system+prompt pair to the correct edge function by inspecting the
 * system prompt prefix, falling back to ai-summarize as a safe default.
 */
export async function generateAIResponse(params: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  // Classify calls embed their own system prompt and need the classify function.
  // We detect this by checking for the sentinel phrase from classify.ts.
  const isClassify =
    params.system.includes("email analyst") && params.system.includes("intent");

  if (isClassify) {
    // Extract subject + body from the formatted prompt
    const result = await callEdgeFunction<{
      summary?: string;
      category?: string;
      priority?: string;
      tags?: string[];
      intent?: string;
      confidence?: number;
      reasoning?: string;
    }>("ai-classify", {
      subject: extractSubject(params.prompt),
      messages: [{ sender: "thread", body: params.prompt }],
    });
    // Return as JSON string so parseClassifyResponse in classify.ts can handle it
    return JSON.stringify(result);
  }

  // For all other uses (summarize, suggest-reply, improve) we call ai-summarize
  // with the prompt as a single message. This is a transitional path — the
  // Next.js API routes should be updated to call edge functions directly.
  const result = await callEdgeFunction<{ summary?: string; improved?: string; reply?: string }>(
    "ai-summarize",
    {
      messages: [{ sender: "user", body: params.prompt }],
    },
  );
  return result.summary ?? result.improved ?? result.reply ?? "";
}

/** Extract the subject line from a formatted classify prompt. */
function extractSubject(prompt: string): string {
  const match = prompt.match(/^Thread subject:\s*(.+)/m);
  return match ? match[1].trim() : "(no subject)";
}

/**
 * Strip HTML to plain text before sending to AI.
 * Kept in Next.js because routes strip HTML server-side before calling edge functions.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
