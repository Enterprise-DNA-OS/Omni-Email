"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Users, ExternalLink, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

type Contact = {
  email: string;
  name: string | null;
  messageCount: number;
  lastSeen: string;
  relationshipScore?: number | null;
  daysSinceReply?: number | null;
};

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-600",
  "bg-rose-100 text-rose-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-cyan-100 text-cyan-600",
  "bg-violet-100 text-violet-600",
  "bg-pink-100 text-pink-600",
  "bg-teal-100 text-teal-600",
];

function avatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function scoreDotColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-yellow-400";
  return "bg-red-500";
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ContactsView({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setContacts(initialContacts);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(q.trim())}`);
        const json = (await res.json()) as { contacts?: Contact[] };
        setContacts(json.contacts ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [q, initialContacts]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="animate-slide-up relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts..."
          className="w-full rounded-xl border border-border bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted shadow-xs transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-48 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && contacts.length === 0 && (
        <EmptyState
          icon={Users}
          title="No contacts found"
          description={q ? `No contacts matching "${q}"` : "Connect an email account and sync to see your contacts here."}
        />
      )}

      {/* Contact grid */}
      {!loading && contacts.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c, i) => {
            const initial = (c.name ?? c.email).charAt(0).toUpperCase();
            const colorClass = avatarColor(c.email);
            return (
              <Link
                key={c.email}
                href={`/inbox?q=${encodeURIComponent(c.email)}`}
                className="group animate-fade-in rounded-xl border border-border bg-surface-1 p-4 shadow-xs transition-all hover:shadow-sm"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${colorClass}`}
                    >
                      {initial}
                    </div>
                    {c.relationshipScore != null && (
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 ${scoreDotColor(c.relationshipScore)}`}
                        title={`Relationship score: ${c.relationshipScore}`}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {c.name ?? c.email}
                    </p>
                    {c.name && (
                      <p className="truncate text-xs text-text-muted">{c.email}</p>
                    )}
                  </div>
                  {/* Always show affordance on touch; fade in on desktop hover */}
                  <ExternalLink
                    size={14}
                    className="shrink-0 text-text-muted opacity-60 transition-opacity group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                  <span>{c.messageCount} email{c.messageCount !== 1 ? "s" : ""}</span>
                  <span>Last: {relativeTime(c.lastSeen)}</span>
                </div>
                {c.daysSinceReply != null && c.daysSinceReply > 7 && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    <AlertCircle size={11} />
                    No reply in {c.daysSinceReply} days
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
