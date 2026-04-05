/**
 * Tone Learning — Feature 4.3
 *
 * Analyzes the writing style of a connected account by examining the last 50
 * sent messages and storing a prose profile in accounts.writing_style_profile.
 * The profile is injected into reply generation prompts so the AI matches
 * the user's natural voice.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripHtml } from "@/lib/ai/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface StyleProfile {
  accountId: string;
  profile: string;
  analyzedAt: string;
}

/**
 * Analyze the writing style of a single account.
 * Fetches the last 50 sent messages, calls the ai-analyze-style edge function,
 * and persists the resulting profile back to accounts.writing_style_profile.
 *
 * @param accountId - The account UUID to analyze
 * @param userId - The owning user (used for RLS-safe reads)
 * @returns The generated style profile string, or null on failure
 */
export async function analyzeWritingStyle(
  accountId: string,
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();

  // Verify the account belongs to this user
  const { data: account } = await admin
    .from("accounts")
    .select("id, email_address")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!account) return null;

  const emailAddress = (account.email_address as string) ?? "";

  // Load the last 50 sent messages from this account
  // "Sent" = messages where the sender matches the account's email address
  const { data: messages } = await admin
    .from("messages")
    .select("body_html, body_text, message_at")
    .eq("account_id", accountId)
    .ilike("sender", `%${emailAddress}%`)
    .order("message_at", { ascending: false })
    .limit(50);

  if (!messages || messages.length === 0) {
    // Not enough data — store an empty marker so we don't keep retrying
    await admin
      .from("accounts")
      .update({ style_analyzed_at: new Date().toISOString() })
      .eq("id", accountId);
    return null;
  }

  // Convert to plain text bodies, capped to save tokens
  const bodies = messages.map((m) => {
    const text =
      (m.body_text as string) ||
      (m.body_html ? stripHtml(m.body_html as string) : "");
    return text.slice(0, 800).trim();
  }).filter(Boolean);

  if (bodies.length === 0) return null;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars are not set");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-analyze-style`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ bodies }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-analyze-style error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { profile?: string };
  const profile = data.profile?.trim() ?? "";

  if (profile) {
    await admin
      .from("accounts")
      .update({
        writing_style_profile: profile,
        style_analyzed_at: new Date().toISOString(),
      })
      .eq("id", accountId);
  }

  return profile || null;
}

/**
 * Return the writing style profile for a given account.
 * Returns null if no profile has been generated yet.
 */
export async function getStyleContext(accountId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("accounts")
    .select("writing_style_profile")
    .eq("id", accountId)
    .maybeSingle();

  return (data?.writing_style_profile as string | null | undefined) ?? null;
}
