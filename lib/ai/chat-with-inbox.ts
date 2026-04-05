/**
 * Chat with Inbox — core processing logic.
 *
 * Flow for each user message:
 *   1. Run semantic search to find relevant emails
 *   2. Load the last 10 chat messages for conversation history
 *   3. Call the ai-chat edge function with search results + history
 *   4. Persist both user and assistant messages to chat_messages
 *   5. Return the assistant response + proposed actions
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { semanticSearch, type SemanticSearchResult } from "@/lib/ai/semantic-search";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface ChatAction {
  type:
    | "archive"
    | "mark_read"
    | "mark_unread"
    | "star"
    | "delete"
    | "label"
    | "snooze"
    | "tag"
    | "forward"
    | "create_rule"
    | "create_draft"
    | "update_settings"
    | "daily_summary"
    | "set_followup";
  threadId?: string;
  params: Record<string, unknown>;
  description: string;
}

export interface ChatResponse {
  response: string;
  actions: ChatAction[];
  threadRefs: string[];
  searchResults: SemanticSearchResult[];
}

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function chatEdgeFunctionUrl(): string {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${SUPABASE_URL}/functions/v1/ai-chat`;
}

async function callChatFunction(payload: {
  message: string;
  context?: string;
  searchResults: SemanticSearchResult[];
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ response: string; actions: ChatAction[]; threadRefs: string[] }> {
  const authToken = SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY;
  if (!authToken) throw new Error("Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set");

  const res = await fetch(chatEdgeFunctionUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      apikey: SUPABASE_ANON_KEY ?? "",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit reached — please try again shortly");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat AI service error (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    response: string;
    actions: ChatAction[];
    threadRefs: string[];
  }>;
}

/**
 * Process a user message through semantic search + AI, then persist both turns.
 */
export async function processUserMessage(
  userId: string,
  message: string,
  context?: string,
): Promise<ChatResponse> {
  const admin = createAdminClient();

  // 1. Semantic search — find relevant emails for this query
  let searchResults: SemanticSearchResult[] = [];
  try {
    searchResults = await semanticSearch(userId, message, 8);
  } catch (e) {
    // Non-fatal: chat can continue without email context
    console.error("Semantic search failed (non-fatal):", e);
  }

  // 2. Load conversation history (last 10 messages for the AI, newest first in DB)
  const { data: historyRows } = await admin
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Reverse to chronological order for the AI prompt
  const chatHistory = (
    (historyRows ?? []) as Array<{ role: "user" | "assistant"; content: string }>
  ).reverse();

  // 3. Persist the user's message immediately so history is up-to-date
  const { error: insertUserErr } = await admin.from("chat_messages").insert({
    user_id: userId,
    role: "user",
    content: message,
    metadata: context ? { context } : {},
  });

  if (insertUserErr) {
    throw insertUserErr;
  }

  // 4. Call the edge function
  const aiResult = await callChatFunction({
    message,
    context,
    searchResults,
    chatHistory,
  });

  // 5. Persist the assistant's response
  const { error: insertAsstErr } = await admin.from("chat_messages").insert({
    user_id: userId,
    role: "assistant",
    content: aiResult.response,
    metadata: {
      actions: aiResult.actions,
      threadRefs: aiResult.threadRefs,
      searchResultCount: searchResults.length,
    },
  });

  if (insertAsstErr) {
    throw insertAsstErr;
  }

  return {
    response: aiResult.response,
    actions: aiResult.actions,
    threadRefs: aiResult.threadRefs,
    searchResults,
  };
}

/**
 * Fetch recent chat history for a user.
 */
export async function getChatHistory(
  userId: string,
  limit = 50,
): Promise<ChatHistoryMessage[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("chat_messages")
    .select("id, role, content, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Return in chronological order
  return ((data ?? []) as ChatHistoryMessage[]).reverse();
}

/**
 * Clear all chat history for a user.
 */
export async function clearChatHistory(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("chat_messages").delete().eq("user_id", userId);
  if (error) throw error;
}
