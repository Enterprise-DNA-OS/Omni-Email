import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface AnalyzeStyleRequest {
  bodies: string[];
}

const SYSTEM_PROMPT = `You are a writing style analyst. Analyze the provided email message bodies written by a single person and produce a concise writing style profile.

Your profile should describe:
1. Greeting style (e.g. "Uses 'Hi [Name],' or jumps straight in without greeting")
2. Sign-off style (e.g. "Consistently signs off with 'Best,' followed by first name only")
3. Formality level (e.g. "Semi-formal — professional but not stiff; avoids jargon")
4. Sentence structure (e.g. "Short punchy sentences; rarely uses subordinate clauses")
5. Paragraph length (e.g. "Keeps paragraphs to 1-3 sentences; uses whitespace generously")
6. Vocabulary (e.g. "Plain English preferred; occasional industry terms like 'deliverables'")
7. Tone markers (e.g. "Warm but direct; uses 'please' and 'thank you' consistently")
8. Any distinctive patterns (e.g. "Uses bullet lists for multi-item replies; always confirms receipt")

Write the profile as flowing prose (3-6 sentences). Be specific and concrete — this profile will be used to instruct an AI to write emails in this person's voice.

Do not include any preamble, markdown, or labels. Return ONLY the profile text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: AnalyzeStyleRequest;
  try {
    payload = (await req.json()) as AnalyzeStyleRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!Array.isArray(payload.bodies) || payload.bodies.length === 0) {
    return Response.json(
      { error: "bodies array is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Cap at 50 samples, each truncated to 800 chars, total prompt ~40k chars max
  const samples = payload.bodies.slice(0, 50);
  const formatted = samples
    .map((b, i) => `--- Message ${i + 1} ---\n${b}`)
    .join("\n\n");

  try {
    const profile = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze the writing style from these ${samples.length} sent email messages:\n\n${formatted}`,
        },
      ],
      max_tokens: 400,
    });

    return Response.json({ profile: profile.trim() }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
