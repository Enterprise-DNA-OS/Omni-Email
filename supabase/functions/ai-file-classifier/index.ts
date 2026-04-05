import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `You are a document filing assistant. Given an email attachment's filename, MIME type, the email subject, and the sender, plus a list of available destination folders, determine the best folder to file the document into.

Return a JSON object with these fields:
- "folder": the exact folder name from the provided list that best matches (or a new folder name if none fit well)
- "folder_id": the folder ID from the provided list if matched, otherwise null
- "confidence": a float between 0.0 and 1.0 — how confident you are in this placement
- "reasoning": one concise sentence explaining why this folder was chosen

Rules:
- Prefer existing folders over creating new ones
- If a new folder name is needed, make it concise (1-3 words, Title Case)
- Base the decision primarily on filename and subject context
- invoices/receipts belong in finance-related folders
- contracts/agreements belong in legal folders
- presentations belong with project or client folders
- Return ONLY valid JSON, no markdown or explanation`;

interface FolderOption {
  id: string;
  name: string;
  path?: string;
}

interface ClassifierRequest {
  filename: string;
  mime_type?: string;
  subject?: string;
  sender?: string;
  folders: FolderOption[];
}

interface ClassifierResult {
  folder: string;
  folder_id: string | null;
  confidence: number;
  reasoning: string;
}

function parseResponse(raw: string, folders: FolderOption[]): ClassifierResult {
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<ClassifierResult>;

    const folder = typeof parsed.folder === "string" && parsed.folder.length > 0
      ? parsed.folder
      : "Attachments";

    // Validate folder_id against provided list
    let folderId: string | null = null;
    if (typeof parsed.folder_id === "string") {
      const match = folders.find((f) => f.id === parsed.folder_id);
      folderId = match ? match.id : null;
    }

    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

    const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.length > 0
      ? parsed.reasoning
      : "Best available folder match.";

    return { folder, folder_id: folderId, confidence, reasoning };
  } catch {
    return {
      folder: "Attachments",
      folder_id: null,
      confidence: 0.3,
      reasoning: "Could not parse AI response; defaulting to Attachments.",
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

  let payload: ClassifierRequest;
  try {
    payload = (await req.json()) as ClassifierRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { filename, mime_type, subject, sender, folders } = payload;

  if (!filename || !Array.isArray(folders)) {
    return Response.json(
      { error: "filename and folders are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const folderList = folders
    .map((f) => `- ${f.name} (id: ${f.id})${f.path ? ` — path: ${f.path}` : ""}`)
    .join("\n");

  const userPrompt = [
    `Filename: ${filename}`,
    mime_type ? `MIME type: ${mime_type}` : null,
    subject ? `Email subject: ${subject}` : null,
    sender ? `Sender: ${sender}` : null,
    "",
    "Available folders:",
    folderList || "(none — suggest a new folder name)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const raw = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const result = parseResponse(raw, folders);
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
