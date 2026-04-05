import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface ThreadSummary {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  aiCategory: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
  aiIntent: string | null;
  lastMessageAt: string;
}

interface DigestRequest {
  threads: ThreadSummary[];
  configName: string;
  periodStart: string;
  periodEnd: string;
  categories: string[];
}

interface DigestResult {
  title: string;
  executiveSummary: string;
  keyHighlights: Array<{
    subject: string;
    sender: string;
    reason: string;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
  }>;
  actionItems: string[];
  threadCount: number;
  period: string;
}

const SYSTEM_PROMPT =
  `You are an executive email assistant generating a structured digest for a busy professional. ` +
  `Analyze the provided email threads and produce a clear, actionable digest. ` +
  `Focus on what matters most: urgent items, decisions needed, and key information. ` +
  `Be concise and direct. Write in second person. ` +
  `Return a JSON object with exactly these fields:
- title: string — a short, descriptive title for this digest (e.g. "Daily Digest: 12 threads, 3 urgent")
- executiveSummary: string — 2-3 sentences covering the most important themes and actions needed
- keyHighlights: array of up to 5 objects with { subject, sender, reason } — the most important threads and why
- categoryBreakdown: array of objects with { category, count } — how many threads per category
- actionItems: array of strings — specific actions the user should take, max 5
Return only valid JSON, no markdown, no preamble.`;

function formatThreadsForPrompt(threads: ThreadSummary[]): string {
  if (threads.length === 0) return "No threads in this period.";

  const lines: string[] = [];
  lines.push(`Total threads: ${threads.length}`);
  lines.push("");

  threads.forEach((t, i) => {
    lines.push(`Thread ${i + 1}:`);
    lines.push(`  Subject: ${t.subject}`);
    lines.push(`  From: ${t.senderName} <${t.senderEmail}>`);
    if (t.aiCategory) lines.push(`  Category: ${t.aiCategory}`);
    if (t.aiPriority) lines.push(`  Priority: ${t.aiPriority}`);
    if (t.aiIntent) lines.push(`  Intent: ${t.aiIntent}`);
    if (t.aiSummary) lines.push(`  Summary: ${t.aiSummary}`);
    lines.push(`  Last message: ${t.lastMessageAt}`);
    lines.push("");
  });

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: DigestRequest;
  try {
    payload = (await req.json()) as DigestRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!payload.threads || !payload.configName || !payload.periodStart || !payload.periodEnd) {
    return Response.json(
      { error: "threads, configName, periodStart, and periodEnd are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const periodLabel = `${new Date(payload.periodStart).toLocaleDateString()} – ${new Date(payload.periodEnd).toLocaleDateString()}`;
  const threadContext = formatThreadsForPrompt(payload.threads);

  const userMessage =
    `Digest name: ${payload.configName}\n` +
    `Period: ${periodLabel}\n` +
    `Categories included: ${payload.categories.length > 0 ? payload.categories.join(", ") : "all"}\n\n` +
    `Email threads:\n${threadContext}\n\n` +
    `Generate the digest JSON now.`;

  try {
    const raw = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    let result: DigestResult;
    try {
      result = JSON.parse(raw) as DigestResult;
    } catch {
      // Fallback: extract JSON from response if model added extra text
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI returned non-JSON response");
      }
      result = JSON.parse(jsonMatch[0]) as DigestResult;
    }

    // Ensure required fields exist
    if (!result.title) {
      result.title = `${payload.configName}: ${payload.threads.length} threads (${periodLabel})`;
    }
    if (!result.executiveSummary) {
      result.executiveSummary = `Your digest for ${periodLabel} contains ${payload.threads.length} threads.`;
    }
    result.keyHighlights = result.keyHighlights ?? [];
    result.categoryBreakdown = result.categoryBreakdown ?? [];
    result.actionItems = result.actionItems ?? [];
    result.threadCount = payload.threads.length;
    result.period = periodLabel;

    return Response.json({ digest: result }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
