/**
 * Knowledge Retrieval — Knowledge Base & Snippets feature
 *
 * Retrieves relevant knowledge_entries for AI reply generation by combining:
 *   1. Global entries (scope='global', is_active=true)
 *   2. Sender-specific entries matching senderEmail
 *   3. Domain-specific entries matching senderDomain
 *   4. Full-text search against subject + body keywords
 *
 * Returns deduplicated, relevance-sorted entries and updates usage tracking.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  id: string;
  type: "fact" | "preference" | "procedure" | "snippet";
  title: string;
  content: string;
  scope: "global" | "sender" | "domain" | "topic";
  scope_value: string | null;
  usage_count: number;
  last_used_at: string | null;
}

export interface KnowledgeContext {
  senderEmail?: string | null;
  senderDomain?: string | null;
  subject?: string | null;
  body?: string | null;
}

// ---------------------------------------------------------------------------
// getRelevantKnowledge
// ---------------------------------------------------------------------------

/**
 * Retrieve knowledge entries most relevant to the current email context.
 * Combines scope-based lookup and full-text search, then deduplicates.
 *
 * @param userId  - Owning user UUID
 * @param context - Email context signals for relevance matching
 * @returns Ordered array of relevant KnowledgeEntry objects (most relevant first)
 */
export async function getRelevantKnowledge(
  userId: string,
  context: KnowledgeContext,
): Promise<KnowledgeEntry[]> {
  const admin = createAdminClient();

  const seenIds = new Set<string>();
  const results: KnowledgeEntry[] = [];

  function addEntries(rows: KnowledgeEntry[]) {
    for (const row of rows) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push(row);
      }
    }
  }

  const baseSelect =
    "id, type, title, content, scope, scope_value, usage_count, last_used_at";

  // 1. Sender-specific entries (highest priority — most specific)
  if (context.senderEmail) {
    const { data: senderRows } = await admin
      .from("knowledge_entries")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("scope", "sender")
      .eq("scope_value", context.senderEmail.toLowerCase());

    addEntries((senderRows ?? []) as KnowledgeEntry[]);
  }

  // 2. Domain-specific entries
  const domain =
    context.senderDomain ??
    (context.senderEmail?.split("@")[1] ?? null);

  if (domain) {
    const { data: domainRows } = await admin
      .from("knowledge_entries")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("scope", "domain")
      .eq("scope_value", domain.toLowerCase());

    addEntries((domainRows ?? []) as KnowledgeEntry[]);
  }

  // 3. Full-text search against subject + body (topic-scoped + global)
  const searchText = [context.subject, context.body]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500); // cap to avoid oversized tsquery

  if (searchText.trim()) {
    const { data: ftsRows } = await admin
      .from("knowledge_entries")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("is_active", true)
      .textSearch("search_vector", searchText, {
        type: "plain",
        config: "english",
      })
      .limit(10);

    addEntries((ftsRows ?? []) as KnowledgeEntry[]);
  }

  // 4. Global entries (always included — lowest priority, fill after specific)
  const { data: globalRows } = await admin
    .from("knowledge_entries")
    .select(baseSelect)
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("scope", "global")
    .order("usage_count", { ascending: false })
    .limit(20);

  addEntries((globalRows ?? []) as KnowledgeEntry[]);

  // Update usage tracking for returned entries (fire-and-forget, non-blocking)
  if (results.length > 0) {
    const now = new Date().toISOString();
    void Promise.all(
      results.map((entry) =>
        Promise.resolve(
          admin
            .from("knowledge_entries")
            .update({
              usage_count: entry.usage_count + 1,
              last_used_at: now,
            })
            .eq("id", entry.id),
        ).catch(() => undefined),
      ),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// formatKnowledgeForPrompt
// ---------------------------------------------------------------------------

/**
 * Format knowledge entries into a structured prompt section.
 * Groups entries by type so the AI can reference them clearly.
 *
 * @param entries - Array of knowledge entries to format
 * @returns A markdown-formatted string ready for injection into an AI prompt
 */
export function formatKnowledgeForPrompt(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "";

  const groups: Record<string, KnowledgeEntry[]> = {
    fact: [],
    preference: [],
    procedure: [],
    snippet: [],
  };

  for (const entry of entries) {
    groups[entry.type]?.push(entry);
  }

  const sections: string[] = [];

  const typeLabels: Record<string, string> = {
    fact: "Facts about me / my business",
    preference: "My preferences",
    procedure: "Procedures to follow",
    snippet: "Reply snippets to use verbatim or adapt",
  };

  for (const [type, typeEntries] of Object.entries(groups)) {
    if (typeEntries.length === 0) continue;
    const label = typeLabels[type] ?? type;
    const items = typeEntries
      .map((e) => `- **${e.title}**: ${e.content}`)
      .join("\n");
    sections.push(`### ${label}\n${items}`);
  }

  return (
    `## Your Knowledge Base\n` +
    `The following facts, preferences, and procedures are personal to you. ` +
    `Apply them when drafting the reply.\n\n` +
    sections.join("\n\n")
  );
}
