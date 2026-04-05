import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CORS_HEADERS } from "../_shared/openrouter.ts";

const OPENAI_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const MAX_BATCH_SIZE = 20;

interface EmbeddingsRequest {
  texts: string[];
}

interface EmbeddingsResponse {
  embeddings: number[][];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY secret is not set" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let payload: EmbeddingsRequest;
  try {
    payload = (await req.json()) as EmbeddingsRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { texts } = payload;
  if (!Array.isArray(texts) || texts.length === 0) {
    return Response.json(
      { error: "texts array is required and must not be empty" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (texts.length > MAX_BATCH_SIZE) {
    return Response.json(
      { error: `Batch size must not exceed ${MAX_BATCH_SIZE}` },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  try {
    const res = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://omni.email",
        "X-Title": "Omni Email",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (res.status === 429) {
      return Response.json(
        { error: "AI rate limit reached — please try again shortly" },
        { status: 429, headers: CORS_HEADERS },
      );
    }

    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `Embeddings API error (${res.status}): ${text}` },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };

    if (!json.data || json.data.length === 0) {
      return Response.json(
        { error: "Embeddings API returned no data" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // Sort by index to maintain input order (OpenRouter may reorder)
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    const embeddings: number[][] = sorted.map((d) => d.embedding);

    const result: EmbeddingsResponse = { embeddings };
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Embeddings error";
    return Response.json({ error: msg }, { status: 500, headers: CORS_HEADERS });
  }
});
