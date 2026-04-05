"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Users,
  Building2,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

// ---- Types -----------------------------------------------------------------

type ContactIntelligence = {
  email: string;
  name: string | null;
  domain: string;
  score: number; // 0-100
  messagesIn: number;
  messagesOut: number;
  lastInteraction: string | null;
  trend: "up" | "down" | "stable";
  daysSinceReply: number | null;
};

type IntelligenceData = {
  topContacts: ContactIntelligence[];
  neglected: ContactIntelligence[];
  companies: Array<{
    domain: string;
    contactCount: number;
    totalMessages: number;
    avgScore: number;
  }>;
};

// ---- Helpers ---------------------------------------------------------------

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

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreDotColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-yellow-400";
  return "bg-red-500";
}

// ---- Score Bar -------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      {/* flex-1 instead of w-24 so the bar scales with card width on mobile */}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${scoreColor(score)} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium text-text-muted">{score}</span>
    </div>
  );
}

// ---- Trend Icon ------------------------------------------------------------

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")
    return <TrendingUp size={14} className="text-emerald-500" />;
  if (trend === "down") return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-text-muted" />;
}

// ---- Contact Card ----------------------------------------------------------

function ContactCard({ contact }: { contact: ContactIntelligence }) {
  const initial = (contact.name ?? contact.email).charAt(0).toUpperCase();
  const colorClass = avatarColor(contact.email);
  const isNeglected =
    contact.daysSinceReply !== null && contact.daysSinceReply > 7;

  return (
    <Link
      href={`/inbox?q=${encodeURIComponent(contact.email)}`}
      className="group relative rounded-xl border border-border bg-surface-1 p-4 shadow-xs transition-all hover:shadow-sm hover:border-accent/30"
    >
      {isNeglected && (
        <span className="absolute right-3 top-3 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
          No reply {contact.daysSinceReply}d
        </span>
      )}
      <div className="mb-3 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${colorClass}`}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate pr-16 text-sm font-semibold text-text-primary">
            {contact.name ?? contact.email}
          </p>
          {contact.name && (
            <p className="truncate text-xs text-text-muted">{contact.email}</p>
          )}
        </div>
      </div>

      <ScoreBar score={contact.score} />

      <div className="mt-3 grid grid-cols-3 gap-1 text-center">
        <div>
          <p className="text-xs font-semibold text-text-primary">
            {contact.messagesIn}
          </p>
          <p className="text-[10px] text-text-muted">received</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-text-primary">
            {contact.messagesOut}
          </p>
          <p className="text-[10px] text-text-muted">sent</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-text-primary">
            {relativeTime(contact.lastInteraction)}
          </p>
          <p className="text-[10px] text-text-muted">last</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-text-muted">{contact.domain}</span>
        <TrendIcon trend={contact.trend} />
      </div>
    </Link>
  );
}

// ---- Neglected Row ---------------------------------------------------------

function NeglectedRow({ contact }: { contact: ContactIntelligence }) {
  return (
    <Link
      href={`/inbox?q=${encodeURIComponent(contact.email)}`}
      /* min-h-[44px] ensures the tap target meets the 44px minimum on mobile */
      className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3 transition-colors hover:border-red-300/60 hover:bg-red-50/30 dark:hover:border-red-800/30 dark:hover:bg-red-900/10"
    >
      <div
        className={`h-2 w-2 shrink-0 rounded-full ${scoreDotColor(contact.score)}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {contact.name ?? contact.email}
        </p>
        <p className="text-xs text-text-muted">{contact.email}</p>
      </div>
      <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
        {contact.daysSinceReply}d no reply
      </span>
    </Link>
  );
}

// ---- Loading Skeleton -------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

// ---- Main ------------------------------------------------------------------

export function RelationshipDashboard() {
  const toast = useToast();
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/intelligence");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to load relationship data");
      }
      const json = (await res.json()) as IntelligenceData;
      setData(json);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : "Failed to load relationship data",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <DashboardSkeleton />;

  if (!data || data.topContacts.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No relationship data yet"
        description="Sync your email accounts and send/receive emails to build relationship intelligence."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Contacts */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Users size={16} className="text-accent" />
          Top Contacts by Relationship Score
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.topContacts.slice(0, 10).map((contact) => (
            <ContactCard key={contact.email} contact={contact} />
          ))}
        </div>
      </section>

      {/* Neglected */}
      {data.neglected.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <AlertCircle size={16} className="text-red-500" />
            Neglected Contacts
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {data.neglected.length}
            </span>
          </h2>
          <div className="space-y-2">
            {data.neglected.map((contact) => (
              <NeglectedRow key={contact.email} contact={contact} />
            ))}
          </div>
        </section>
      )}

      {/* Companies */}
      {data.companies.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Building2 size={16} className="text-text-muted" />
            By Company
          </h2>
          {/* overflow-x-auto prevents the 4-column table from breaking layout
              on narrow viewports; users can scroll horizontally on small phones */}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3 text-left">Domain</th>
                  <th className="px-4 py-3 text-right">Contacts</th>
                  <th className="px-4 py-3 text-right">Messages</th>
                  <th className="px-4 py-3 text-right">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {data.companies.map((co) => (
                  <tr
                    key={co.domain}
                    className="transition-colors hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {co.domain}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {co.contactCount}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {co.totalMessages}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          co.avgScore >= 70
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : co.avgScore >= 40
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {co.avgScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
