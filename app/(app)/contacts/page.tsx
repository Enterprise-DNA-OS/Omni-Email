import { createClient } from "@/lib/supabase/server";
import { ContactsView } from "@/components/ContactsView";
import { RelationshipDashboard } from "@/components/RelationshipDashboard";

export const metadata = { title: "Contacts — Omni Email" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "relationships" ? "relationships" : "contacts";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Fetch initial contacts server-side (only needed for the contacts tab)
  let initialContacts: Array<{
    email: string;
    name: string | null;
    messageCount: number;
    lastSeen: string;
    relationshipScore: number | null;
    daysSinceReply: number | null;
  }> = [];

  if (activeTab === "contacts") {
    try {
      const { data: threads } = await supabase
        .from("threads")
        .select("id")
        .eq("user_id", user.id);

      if (threads && threads.length > 0) {
        const threadIds = threads.map((t) => t.id as string);
        const { data: messages } = await supabase
          .from("messages")
          .select("sender, message_at")
          .in("thread_id", threadIds)
          .order("message_at", { ascending: false })
          .limit(3000);

        const contactMap = new Map<
          string,
          { name: string | null; count: number; lastSeen: string }
        >();

        for (const msg of messages ?? []) {
          if (!msg.sender) continue;
          const sender = msg.sender as string;
          const match = sender.match(/^(.*?)\s*<([^>]+)>\s*$/);
          const email = match ? match[2].trim().toLowerCase() : sender.trim().toLowerCase();
          const name = match
            ? match[1].trim().replace(/^["']|["']$/g, "") || null
            : null;

          if (!email || email.includes("noreply") || email.includes("no-reply")) continue;

          const existing = contactMap.get(email);
          if (existing) {
            existing.count++;
            if (name && !existing.name) existing.name = name;
          } else {
            contactMap.set(email, { name, count: 1, lastSeen: msg.message_at as string });
          }
        }

        initialContacts = Array.from(contactMap.entries())
          .map(([email, { name, count, lastSeen }]) => ({
            email,
            name,
            messageCount: count,
            lastSeen,
            relationshipScore: null,
            daysSinceReply: null,
          }))
          .sort((a, b) => b.messageCount - a.messageCount)
          .slice(0, 100);
      }
    } catch {
      /* fallback to empty */
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Contacts</h1>
        <p className="mt-1 text-sm text-text-muted">
          People you&apos;ve emailed with across all accounts.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-border">
        <a
          href="/contacts"
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "contacts"
              ? "border-b-2 border-accent text-accent"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          All Contacts
        </a>
        <a
          href="/contacts?tab=relationships"
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "relationships"
              ? "border-b-2 border-accent text-accent"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Relationship Intelligence
        </a>
      </div>

      {activeTab === "contacts" ? (
        <ContactsView initialContacts={initialContacts} />
      ) : (
        <RelationshipDashboard />
      )}
    </div>
  );
}
