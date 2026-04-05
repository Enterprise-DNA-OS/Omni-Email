/**
 * Reply mode definitions for the AI suggest-reply feature.
 *
 * Each mode has a unique system prompt instruction that the edge function
 * appends to the base prompt. Adding a new mode means adding one entry here
 * and updating the VALID_TONES list in both the API route and the edge function.
 *
 * SYNC NOTE: The ReplyMode type and REPLY_MODE_PROMPTS below must stay in sync
 * with the Tone type and VALID_TONES list in
 * supabase/functions/ai-suggest-reply/index.ts (Deno runtime).
 * Both must have exactly the same 11 tones. When adding or removing a tone,
 * update BOTH files: this file (Node.js) and the edge function (Deno).
 * Current tones (11): professional, friendly, brief, concise, warm, executive,
 *                     support, sales, legal_safe, detailed, casual
 */

export type ReplyMode =
  | "professional"
  | "friendly"
  | "brief"
  | "casual"
  | "executive"
  | "sales"
  | "support"
  | "concise"
  | "warm"
  | "detailed"
  | "legal_safe";

export const REPLY_MODE_PROMPTS: Record<ReplyMode, string> = {
  // General
  professional:
    "Be polished and business-appropriate without being overly formal. Use clear, confident language.",
  friendly:
    "Be warm, approachable, and personable. Use a conversational tone that feels human and genuine.",
  brief:
    "Keep the reply under 3 sentences — be direct and to the point. No filler.",
  casual:
    "Write as you would to a friend or close colleague. Relaxed grammar is fine. Contractions welcome.",

  // Business
  executive:
    "Be authoritative and decisive. Use short sentences. Lead with the key point. No preamble.",
  sales:
    "Be confident and value-focused. Highlight benefits, not features. Include a clear call to action.",
  support:
    "Be helpful, patient, and empathetic. Acknowledge the issue before offering a solution. Thank the sender.",

  // Style
  concise:
    "Be clear and succinct. No padding, filler phrases, or redundant sentences. Every word earns its place.",
  warm:
    "Express genuine care and empathy. Be supportive and encouraging. Make the recipient feel heard.",
  detailed:
    "Be thorough. Address every point raised. Use numbered lists if it aids clarity. Leave nothing unanswered.",
  legal_safe:
    "Be precise and non-committal where appropriate. Avoid admissions, guarantees, or promises. Use measured, qualified language.",
};

/** Mode groups for UI display */
export const REPLY_MODE_GROUPS: { label: string; modes: ReplyMode[] }[] = [
  {
    label: "General",
    modes: ["professional", "friendly", "brief", "casual"],
  },
  {
    label: "Business",
    modes: ["executive", "sales", "support"],
  },
  {
    label: "Style",
    modes: ["concise", "warm", "detailed", "legal_safe"],
  },
];

/** Human-readable labels for modes that have underscores */
export const REPLY_MODE_LABELS: Record<ReplyMode, string> = {
  professional: "Professional",
  friendly: "Friendly",
  brief: "Brief",
  casual: "Casual",
  executive: "Executive",
  sales: "Sales",
  support: "Support",
  concise: "Concise",
  warm: "Warm",
  detailed: "Detailed",
  legal_safe: "Legal Safe",
};
