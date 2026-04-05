import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface KnowledgeEntry {
  id: string;
  type: string;
  title: string;
  usage_count: number;
  created_at: string;
}

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all entries for the user (lightweight select — no content)
  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("id, type, title, usage_count, created_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data ?? []) as KnowledgeEntry[];
  const total = entries.length;

  // Count by type
  const byType: Record<string, number> = {
    fact: 0,
    preference: 0,
    procedure: 0,
    snippet: 0,
  };
  for (const e of entries) {
    if (e.type in byType) byType[e.type]++;
  }

  // Most used entry (highest usage_count)
  let mostUsed: { id: string; title: string; usage_count: number } | null = null;
  for (const e of entries) {
    if (!mostUsed || e.usage_count > mostUsed.usage_count) {
      mostUsed = { id: e.id, title: e.title, usage_count: e.usage_count };
    }
  }

  // Entries added this calendar month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const addedThisMonth = entries.filter((e) => e.created_at >= monthStart).length;

  return NextResponse.json({
    total,
    byType,
    mostUsed,
    addedThisMonth,
  });
}
