import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ContactRow = {
  email: string;
  name: string | null;
  messageCount: number;
  lastSeen: string;
};

function extractEmailAndName(sender: string): { email: string; name: string | null } {
  const match = sender.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, "") || null, email: match[2].trim().toLowerCase() };
  }
  return { email: sender.trim().toLowerCase(), name: null };
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  // Get user's thread IDs
  const { data: threads } = await supabase
    .from("threads")
    .select("id")
    .eq("user_id", user.id);

  if (!threads || threads.length === 0) {
    return NextResponse.json({ contacts: [] });
  }

  const threadIds = threads.map((t) => t.id as string);

  // Get messages from those threads
  const { data: messages } = await supabase
    .from("messages")
    .select("sender, message_at")
    .in("thread_id", threadIds)
    .order("message_at", { ascending: false })
    .limit(5000);

  // Aggregate contacts from senders
  const contactMap = new Map<string, { name: string | null; count: number; lastSeen: string }>();

  for (const msg of messages ?? []) {
    if (!msg.sender) continue;
    const { email, name } = extractEmailAndName(msg.sender as string);
    if (!email || email.includes("noreply") || email.includes("no-reply")) continue;

    const existing = contactMap.get(email);
    if (existing) {
      existing.count++;
      if (name && !existing.name) existing.name = name;
    } else {
      contactMap.set(email, {
        name,
        count: 1,
        lastSeen: msg.message_at as string,
      });
    }
  }

  let contacts: ContactRow[] = Array.from(contactMap.entries()).map(
    ([email, { name, count, lastSeen }]) => ({
      email,
      name,
      messageCount: count,
      lastSeen,
    }),
  );

  // Filter by search query
  if (q) {
    contacts = contacts.filter(
      (c) =>
        c.email.includes(q) ||
        (c.name && c.name.toLowerCase().includes(q)),
    );
  }

  // Sort by frequency
  contacts.sort((a, b) => b.messageCount - a.messageCount);
  contacts = contacts.slice(0, 100);

  return NextResponse.json({ contacts });
}
