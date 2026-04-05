"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  HelpCircle,
  Inbox,
  Loader2,
  MailCheck,
  RefreshCw,
  Reply,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { QuickRuleMenu } from "@/components/QuickRuleMenu";
import { useRouter } from "next/navigation";

// ---- Types ------------------------------------------------------------------

interface ThreadCard {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  priority: string;
  intent: string;
  lastMessageAt: string;
}

interface CatchMeUpBriefing {
  narrative: string;
  estimatedClearTime: string | null;
  urgentThreads: ThreadCard[];
  needsDecision: ThreadCard[];
  updates: ThreadCard[];
  autoHandled: number;
  pendingApprovals: number;
  stats: {
    totalNew: number;
    sinceLabel: string;
  };
}

// ---- Helpers ----------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function parseSenderEmail(sender: string): string | null {
  const match = sender.match(/<([^>]+)>/);
  return match?.[1] ?? (sender.includes("@") ? sender : null);
}

function parseSenderDomain(sender: string): string | null {
  const email = parseSenderEmail(sender);
  return email?.split("@")[1] ?? null;
}

// ---- Sub-components ---------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        accent ? "border-accent/30 bg-accent-muted" : "border-border bg-surface-1"
      }`}
    >
      <Icon
        size={18}
        className={accent ? "text-accent" : "text-text-muted"}
        strokeWidth={1.8}
      />
      <div>
        <p className={`text-xl font-bold ${accent ? "text-accent" : "text-text-primary"}`}>
          {value}
        </p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  onArchive,
  onDismiss,
}: {
  thread: ThreadCard;
  onArchive?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 shadow-xs transition-shadow hover:shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/thread/${thread.id}`}
            className="block truncate text-sm font-semibold text-text-primary hover:text-accent"
          >
            {thread.subject}
          </Link>
          <p className="mt-0.5 text-xs text-text-muted">
            {thread.sender} &middot; {relativeTime(thread.lastMessageAt)}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(thread.id)}
            className="shrink-0 rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {thread.snippet && (
        <p className="mb-3 line-clamp-2 text-xs text-text-secondary">{thread.snippet}</p>
      )}
      {(onArchive || onDismiss) && (
        /* Buttons taller for easier thumb tapping on mobile */
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/thread/${thread.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover sm:py-1.5"
          >
            <Reply size={12} />
            Reply
          </Link>
          {onArchive && (
            <button
              type="button"
              onClick={() => onArchive(thread.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 sm:py-1.5"
            >
              <Archive size={12} />
              Archive
            </button>
          )}
          <QuickRuleMenu
            threadId={thread.id}
            senderEmail={parseSenderEmail(thread.sender)}
            senderDomain={parseSenderDomain(thread.sender)}
            subject={thread.subject}
            aiCategory={null}
          />
        </div>
      )}
    </div>
  );
}

function AutoHandledSection({ count }: { count: number }) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-text-primary"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-500" />
          Auto-Handled by AI
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {count}
          </span>
        </span>
        {open ? (
          <ChevronDown size={16} className="text-text-muted" />
        ) : (
          <ChevronRight size={16} className="text-text-muted" />
        )}
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4">
          <p className="text-sm text-text-muted">
            {count} email{count !== 1 ? "s were" : " was"} automatically processed (archived,
            labeled, or replied to) while you were away. No action needed.
          </p>
        </div>
      )}
    </section>
  );
}

function CatchMeUpSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-xl" />
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <Skeleton className="mb-4 h-5 w-48 rounded" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ---------------------------------------------------------

export function CatchMeUp() {
  const toast = useToast();
  const router = useRouter();
  const [briefing, setBriefing] = useState<CatchMeUpBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const fetchBriefing = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const res = await fetch("/api/ai/catch-me-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 429) {
            toast.show("AI rate limit reached — please try again shortly", "error");
          } else {
            toast.show(j.error ?? "Failed to load briefing", "error");
          }
          return;
        }
        const data = (await res.json()) as CatchMeUpBriefing;
        setBriefing(data);
      } catch {
        toast.show("Failed to connect to AI service", "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void fetchBriefing(false);
  }, [fetchBriefing]);

  const handleArchive = useCallback(
    async (threadId: string) => {
      try {
        await fetch(`/api/threads/${threadId}/archive`, { method: "POST" });
        setBriefing((prev) =>
          prev
            ? {
                ...prev,
                urgentThreads: prev.urgentThreads.filter((t) => t.id !== threadId),
                needsDecision: prev.needsDecision.filter((t) => t.id !== threadId),
              }
            : prev,
        );
        toast.show("Thread archived.", "success");
      } catch {
        toast.show("Archive failed.", "error");
      }
    },
    [toast],
  );

  const handleDismissThread = useCallback((threadId: string) => {
    setBriefing((prev) =>
      prev
        ? {
            ...prev,
            urgentThreads: prev.urgentThreads.filter((t) => t.id !== threadId),
            needsDecision: prev.needsDecision.filter((t) => t.id !== threadId),
          }
        : prev,
    );
  }, []);

  const handleDismissAll = useCallback(async () => {
    setDismissing(true);
    try {
      const res = await fetch("/api/ai/catch-me-up/dismiss", { method: "POST" });
      if (!res.ok) {
        toast.show("Could not save session.", "error");
        return;
      }
      setDismissed(true);
      toast.show("All caught up! Great work.", "success");
    } catch {
      toast.show("Could not dismiss briefing.", "error");
    } finally {
      setDismissing(false);
    }
  }, [toast]);

  if (loading) {
    return <CatchMeUpSkeleton />;
  }

  if (dismissed) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="All caught up!"
        description="Your inbox is under control. Check back later for new activity."
        action={
          <button
            type="button"
            onClick={() => router.push("/inbox")}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover"
          >
            <Inbox size={15} />
            Back to Inbox
          </button>
        }
      />
    );
  }

  if (!briefing) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Could not load briefing"
        description="There was a problem generating your catch-me-up. Try again."
        action={
          <button
            type="button"
            onClick={() => fetchBriefing(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover"
          >
            <RefreshCw size={15} />
            Try again
          </button>
        }
      />
    );
  }

  const {
    narrative,
    estimatedClearTime,
    urgentThreads,
    needsDecision,
    updates,
    autoHandled,
    pendingApprovals,
    stats,
  } = briefing;

  const hasUrgent = urgentThreads.length > 0;
  const hasDecision = needsDecision.length > 0;
  const hasUpdates = updates.length > 0;
  const totalActions = urgentThreads.length + needsDecision.length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="New emails" value={stats.totalNew} icon={Inbox} accent />
        <StatCard label="Need action" value={totalActions} icon={AlertTriangle} />
        <StatCard label="Auto-handled" value={autoHandled} icon={MailCheck} />
        <StatCard label="Pending approvals" value={pendingApprovals} icon={ShieldCheck} />
      </div>

      {/* AI Narrative briefing */}
      <section className="rounded-xl border border-accent/20 bg-accent-muted p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            AI Briefing — since {stats.sinceLabel}
          </span>
          <button
            type="button"
            onClick={() => fetchBriefing(true)}
            disabled={refreshing}
            className="ml-auto rounded-md p-2.5 text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
            title="Refresh briefing"
          >
            {refreshing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
        </div>
        <p className="text-sm leading-relaxed text-text-primary">{narrative}</p>
        {estimatedClearTime && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
            <Timer size={12} />
            {estimatedClearTime}
          </div>
        )}
      </section>

      {/* Urgent threads */}
      {hasUrgent && (
        <section className="animate-slide-up rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <AlertTriangle size={15} className="text-danger" />
            Urgent — Act Now
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {urgentThreads.length}
            </span>
          </h2>
          <div className="space-y-3">
            {urgentThreads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                onArchive={handleArchive}
                onDismiss={handleDismissThread}
              />
            ))}
          </div>
        </section>
      )}

      {/* Needs decision */}
      {hasDecision && (
        <section className="animate-slide-up rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <HelpCircle size={15} className="text-warning" />
            Needs Your Decision
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {needsDecision.length}
            </span>
          </h2>
          <div className="space-y-3">
            {needsDecision.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                onArchive={handleArchive}
                onDismiss={handleDismissThread}
              />
            ))}
          </div>
        </section>
      )}

      {/* Important updates */}
      {hasUpdates && (
        <section className="animate-slide-up rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            Important Updates
          </h2>
          <div className="space-y-3">
            {updates.map((thread) => (
              <Link
                key={thread.id}
                href={`/thread/${thread.id}`}
                className="block rounded-lg border border-border bg-surface-0 p-3 transition-colors hover:border-accent/40 hover:bg-accent-muted/30"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {thread.subject}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {relativeTime(thread.lastMessageAt)}
                  </span>
                </div>
                <p className="text-xs text-text-muted">{thread.sender}</p>
                {thread.snippet && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-text-secondary">
                    {thread.snippet}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Auto-handled by AI */}
      <AutoHandledSection count={autoHandled} />

      {/* Pending approvals */}
      {pendingApprovals > 0 && (
        <section className="animate-slide-up rounded-xl border border-amber-200/60 bg-amber-50/50 p-5 shadow-xs dark:border-amber-900/30 dark:bg-amber-900/10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-400">
            <ShieldCheck size={16} />
            Pending Your Approval
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {pendingApprovals}
            </span>
          </h2>
          <p className="mb-3 text-sm text-text-muted">
            {pendingApprovals} thread{pendingApprovals !== 1 ? "s are" : " is"} waiting for your
            approval before AI can take action.
          </p>
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
          >
            Review approvals
            <ChevronRight size={14} />
          </Link>
        </section>
      )}

      {/* All clear */}
      {!hasUrgent && !hasDecision && !hasUpdates && pendingApprovals === 0 && (
        <div className="animate-fade-in rounded-xl border border-border bg-surface-1 p-8 text-center shadow-xs">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-semibold text-text-primary">You&apos;re all caught up!</p>
          <p className="mt-1 text-xs text-text-muted">
            No urgent items or important updates right now.
          </p>
        </div>
      )}

      {/* Footer — stacks vertically on mobile to prevent overflow at 375px */}
      <div className="animate-fade-in flex flex-col gap-3 rounded-xl border border-border bg-surface-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Clock size={15} className="shrink-0" />
          {estimatedClearTime ? (
            <span>
              Estimated time to clear:{" "}
              <span className="font-semibold text-text-primary">{estimatedClearTime}</span>
            </span>
          ) : (
            <span>Estimated time to clear: calculating...</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismissAll}
          disabled={dismissing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50 sm:w-auto sm:py-2"
        >
          {dismissing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          All caught up!
        </button>
      </div>
    </div>
  );
}
