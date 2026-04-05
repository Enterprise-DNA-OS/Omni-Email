"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  Inbox,
  Mail,
  ChevronDown,
  Loader2,
  Paperclip,
  AlertCircle,
  ArrowUp,
  Minus,
  ArrowDown,
  Sparkles,
  Tag,
  Archive,
  Square,
  CheckSquare,
  FileText,
  Trash2,
} from "lucide-react";
import { SkeletonThreadRow } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { AIFeedback } from "@/components/AIFeedback";
import { BulkToolbar } from "@/components/BulkToolbar";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { RunInboxBanner } from "@/components/RunInboxBanner";

type ThreadRow = {
  id: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  sender?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  account: { provider: string; emailAddress: string } | null;
  hasUnread?: boolean;
  hasAttachments?: boolean;
  aiSummary?: string | null;
  aiCategory?: string | null;
  aiPriority?: string | null;
  aiTags?: string[];
  aiIntent?: string | null;
  aiConfidence?: number | null;
  aiReasoning?: string | null;
  hasDraft?: boolean;
};

type TagRow = { id: string; name: string };

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
  "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
  "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
  "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400",
  "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
];

function avatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function resolveSenderName(t: ThreadRow): string {
  // Prefer message-level sender (earliest message in thread = original sender)
  if (t.sender) {
    const parsed = t.sender.replace(/<.*>/, "").trim();
    if (parsed) return parsed;
    return t.sender;
  }
  // Fall back to thread-level fields
  if (t.senderName) return t.senderName;
  if (t.senderEmail) return t.senderEmail;
  // Last resort: account email
  if (t.account?.emailAddress) return t.account.emailAddress;
  return "Unknown sender";
}

const PRIORITY_CONFIG: Record<string, { icon: typeof AlertCircle; className: string; label: string }> = {
  urgent: { icon: AlertCircle, className: "text-red-500", label: "Urgent" },
  high: { icon: ArrowUp, className: "text-orange-500", label: "High" },
  normal: { icon: Minus, className: "text-text-muted", label: "Normal" },
  low: { icon: ArrowDown, className: "text-blue-400", label: "Low" },
  ignore: { icon: Minus, className: "text-text-muted/50", label: "Ignore" },
};

const CATEGORY_COLORS: Record<string, string> = {
  client: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  billing: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  support: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  notification: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  marketing: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  internal: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  personal: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  security: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  scheduling: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  legal: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

type IntentConfig = { label: string; className: string; barColor: string };

const INTENT_CONFIG: Record<string, IntentConfig> = {
  reply: { label: "Reply", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", barColor: "bg-blue-500" },
  reply_urgent: { label: "Reply", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", barColor: "bg-blue-500" },
  archive: { label: "Archive", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", barColor: "bg-gray-400" },
  delete: { label: "Delete", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", barColor: "bg-red-500" },
  delegate: { label: "Delegate", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", barColor: "bg-orange-500" },
  schedule: { label: "Schedule", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", barColor: "bg-purple-500" },
  review: { label: "Review", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", barColor: "bg-yellow-500" },
  ignore: { label: "Ignore", className: "bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-500", barColor: "bg-gray-300" },
  unsubscribe: { label: "Unsubscribe", className: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", barColor: "bg-pink-500" },
  follow_up: { label: "Follow up", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", barColor: "bg-teal-500" },
  pay: { label: "Payment", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", barColor: "bg-green-500" },
};

async function fetchThreads(params: URLSearchParams) {
  const res = await fetch(`/api/threads?${params.toString()}`);
  return (await res.json()) as {
    threads?: ThreadRow[];
    nextOffset?: number;
    error?: string;
  };
}

export function InboxView(props: {
  initialThreads: ThreadRow[];
  initialFilters: { accountId: string; tagId: string; q: string; trash?: boolean };
  accounts: { id: string; provider: string; emailAddress: string }[];
  tags: TagRow[];
}) {
  const toast = useToast();
  const bulk = useBulkSelection();
  const [threads, setThreads] = useState<ThreadRow[]>(props.initialThreads);
  const [offset, setOffset] = useState(props.initialThreads.length);
  const [accountId, setAccountId] = useState(props.initialFilters.accountId);
  const [tagId, setTagId] = useState(props.initialFilters.tagId);
  const [q, setQ] = useState(props.initialFilters.q);
  const [showTrash, setShowTrash] = useState(props.initialFilters.trash ?? false);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const isFirstFilterRender = useRef(true);
  const queryRef = useRef(q);

  useEffect(() => {
    queryRef.current = q;
  }, [q]);

  function syncUrl(next: { accountId?: string; tagId?: string; q?: string }) {
    const params = new URLSearchParams(window.location.search);
    if (next.accountId !== undefined) {
      if (next.accountId) params.set("accountId", next.accountId);
      else params.delete("accountId");
    }
    if (next.tagId !== undefined) {
      if (next.tagId) params.set("tagId", next.tagId);
      else params.delete("tagId");
    }
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/inbox?${query}` : "/inbox");
  }

  async function runSearch() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("offset", "0");
    if (accountId) params.set("accountId", accountId);
    if (tagId) params.set("tagId", tagId);
    const search = q.trim();
    if (search) params.set("q", search);
    if (showTrash) params.set("trash", "true");
    const json = await fetchThreads(params);
    if (!json.error) {
      setThreads(json.threads ?? []);
      setOffset(json.nextOffset ?? (json.threads?.length ?? 0));
    }
    setLoading(false);
    syncUrl({ q: search });
  }

  async function classifyAll() {
    setClassifying(true);
    try {
      await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      // Refresh threads to show new classifications
      await runSearch();
    } catch {
      // non-fatal
    }
    setClassifying(false);
  }

  async function callUndo(auditLogId: string): Promise<void> {
    const res = await fetch(`/api/audit-log/${auditLogId}/undo`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.show(j.error ?? "Undo failed", "error");
    } else {
      toast.show("Action undone.", "success");
      await runSearch();
    }
  }

  async function archiveThread(threadId: string): Promise<void> {
    setArchivingId(threadId);
    try {
      const res = await fetch(`/api/threads/${threadId}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Archive failed", "error");
        return;
      }
      const result = (await res.json().catch(() => ({}))) as { auditLogId?: string };
      const auditLogId = result.auditLogId ?? null;
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      toast.show(
        "Thread archived.",
        "undo",
        auditLogId
          ? { label: "Undo", onClick: () => callUndo(auditLogId) }
          : undefined,
      );
    } finally {
      setArchivingId(null);
    }
  }

  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("offset", "0");
      if (accountId) params.set("accountId", accountId);
      if (tagId) params.set("tagId", tagId);
      if (queryRef.current.trim()) params.set("q", queryRef.current.trim());
      if (showTrash) params.set("trash", "true");
      const json = await fetchThreads(params);
      if (cancelled) return;
      if (!json.error) {
        setThreads(json.threads ?? []);
        setOffset(json.nextOffset ?? (json.threads?.length ?? 0));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [accountId, tagId, showTrash]);

  async function runSearchAndDeselect() {
    bulk.deselectAll();
    await runSearch();
  }

  return (
    <div className="space-y-4">
      {/* Run My Inbox status banner */}
      <RunInboxBanner />

      {/* Filter bar — mobile-first: stack on small screens, row on sm+ */}
      <div className="animate-slide-up rounded-xl border border-border bg-surface-1 p-3 shadow-xs sm:p-4">
        {/* Row 1 on mobile: Account + Tag selects side-by-side */}
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-text-muted sm:flex-none">
            Account
            <div className="relative">
              <select
                /* text-base (16px) prevents iOS Safari auto-zoom on focus */
                className="w-full appearance-none rounded-lg border border-border bg-surface-0 py-2.5 pl-3 pr-8 text-base text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-auto sm:py-2 sm:text-sm"
                value={accountId}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setAccountId(nextValue);
                  syncUrl({ accountId: nextValue, q: q.trim() });
                }}
              >
                <option value="">All accounts</option>
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.provider} — {a.emailAddress}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-text-muted sm:flex-none">
            Tag
            <div className="relative">
              <select
                /* text-base (16px) prevents iOS Safari auto-zoom on focus */
                className="w-full appearance-none rounded-lg border border-border bg-surface-0 py-2.5 pl-3 pr-8 text-base text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-auto sm:py-2 sm:text-sm"
                value={tagId}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setTagId(nextValue);
                  syncUrl({ tagId: nextValue, q: q.trim() });
                }}
              >
                <option value="">Any tag</option>
                {props.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>
          </label>
        </div>

        {/* Row 2 on mobile: Search input + action buttons */}
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:flex-nowrap">
          <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-text-muted sm:w-auto">
            <span className="sr-only sm:not-sr-only">Search</span>
            <div className="relative w-full sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                /* text-base (16px) prevents iOS Safari auto-zoom on focus */
                className="w-full rounded-lg border border-border bg-surface-0 py-2.5 pl-9 pr-3 text-base text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:py-2 sm:text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search subject or body..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
              />
            </div>
          </label>
          {/* Action buttons: min 44px tap height via py-2.5 on mobile, py-2 on desktop */}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50 sm:py-2"
            disabled={loading}
            onClick={runSearch}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Search
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50 sm:py-2"
            disabled={classifying}
            onClick={classifyAll}
            title="Run AI classification on unprocessed threads"
          >
            {classifying ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {classifying ? "Classifying..." : "Classify"}
          </button>
          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors sm:py-2 ${
              showTrash
                ? "border-danger/40 bg-danger-muted text-danger"
                : "border-border bg-surface-0 text-text-secondary hover:bg-surface-2"
            }`}
            title={showTrash ? "Back to inbox" : "Show trash"}
          >
            <Trash2 size={15} />
            {showTrash ? "Trash" : "Trash"}
          </button>
        </div>
      </div>

      {/* Bulk toolbar */}
      {bulk.selectionCount > 0 && (
        <BulkToolbar
          selectedIds={bulk.selectedIds}
          onDeselectAll={bulk.deselectAll}
          tags={props.tags}
          onActionComplete={runSearchAndDeselect}
        />
      )}

      {/* Thread list */}
      <div className="animate-slide-up overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "60ms" }}>
        {/* Select-all header row */}
        {threads.length > 0 && !loading && (
          <div className="flex items-center gap-3 border-b border-border bg-surface-0 px-4 py-2">
            <button
              type="button"
              onClick={() => {
                const allIds = threads.map((t) => t.id);
                const allSelected = allIds.every((id) => bulk.isSelected(id));
                if (allSelected) {
                  bulk.deselectAll();
                } else {
                  bulk.selectAll(allIds);
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
              aria-label={
                threads.every((t) => bulk.isSelected(t.id))
                  ? "Deselect all"
                  : "Select all"
              }
            >
              {threads.length > 0 && threads.every((t) => bulk.isSelected(t.id)) ? (
                <CheckSquare size={16} className="text-accent" />
              ) : bulk.selectionCount > 0 ? (
                <Minus size={16} className="text-accent" />
              ) : (
                <Square size={16} />
              )}
            </button>
            <span className="text-xs text-text-muted">
              {bulk.selectionCount > 0
                ? `${bulk.selectionCount} of ${threads.length} selected`
                : `${threads.length} threads`}
            </span>
            {bulk.selectionCount === 0 && (
              <button
                type="button"
                onClick={() => bulk.selectAll(threads.map((t) => t.id))}
                className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                Select all
              </button>
            )}
          </div>
        )}

        {loading && threads.length === 0 ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonThreadRow key={i} />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <EmptyState
            icon={showTrash ? Trash2 : Inbox}
            title={showTrash ? "Trash is empty" : "No threads yet"}
            description={
              showTrash
                ? "Deleted threads will appear here."
                : "Connect an email account and sync to see your messages here."
            }
            action={
              showTrash ? undefined : (
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
                >
                  <Mail size={15} />
                  Connect account
                </Link>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-border-muted">
            {threads.map((t) => {
              const displayName = resolveSenderName(t);
              const initial = displayName.charAt(0).toUpperCase();
              const colorClass = avatarColor(displayName);
              const priorityConfig = t.aiPriority ? PRIORITY_CONFIG[t.aiPriority] : null;
              const PriorityIcon = priorityConfig?.icon;
              const categoryColor = t.aiCategory ? CATEGORY_COLORS[t.aiCategory] ?? CATEGORY_COLORS.other : null;
              const previewText = t.aiSummary ?? t.snippet;
              const intentConfig = t.aiIntent && t.aiIntent !== "no_action" ? INTENT_CONFIG[t.aiIntent] ?? null : null;
              const confidencePct = t.aiConfidence != null ? Math.round(t.aiConfidence * 100) : null;

              return (
                <li key={t.id} className="animate-fade-in group relative">
                  {/* Checkbox — always visible on touch devices (no hover); shown on hover on desktop.
                      Minimum 44x44px tap target via p-3 on mobile, shrunk via sm: on desktop */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      bulk.toggle(t.id);
                    }}
                    className="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded text-text-muted transition-all hover:text-accent sm:left-3 sm:h-auto sm:w-auto sm:p-0.5"
                    aria-label={bulk.isSelected(t.id) ? "Deselect thread" : "Select thread"}
                  >
                    {bulk.isSelected(t.id) ? (
                      <CheckSquare size={16} className="text-accent" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>

                  <Link
                    href={`/thread/${t.id}`}
                    className={`flex items-start gap-3 py-3.5 pl-10 pr-14 transition-colors hover:bg-surface-2 ${bulk.isSelected(t.id) ? "bg-accent/5" : ""}`}
                  >
                    {/* Priority indicator */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      {t.hasUnread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                      )}
                      {PriorityIcon && t.aiPriority !== "normal" && (
                        <PriorityIcon
                          size={14}
                          className={priorityConfig!.className}
                          aria-label={priorityConfig!.label}
                        />
                      )}
                    </div>

                    {/* Avatar */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colorClass}`}
                    >
                      {initial}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Row 1: Sender name (truncates) + overflow-safe badge strip.
                          On mobile we hide the email address and confidence bar to keep
                          this row to a single line. Badges are shown on sm+ only. */}
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                        <span className={`min-w-0 truncate text-sm text-text-primary ${t.hasUnread ? "font-bold" : "font-medium"}`}>
                          {displayName}
                        </span>
                        {t.senderEmail && t.senderName && (
                          <span className="hidden truncate text-xs text-text-muted sm:inline">
                            {t.senderEmail}
                          </span>
                        )}
                        {t.account ? (
                          <span
                            className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
                            title={t.account.emailAddress}
                          >
                            <span className="uppercase">{t.account.provider}</span>
                            {/* Show full email address only on sm+ to avoid row overflow */}
                            {t.account.emailAddress && (
                              <span className="ml-1 hidden normal-case opacity-70 sm:inline">
                                {t.account.emailAddress}
                              </span>
                            )}
                          </span>
                        ) : null}
                        {t.aiCategory && categoryColor && (
                          <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline ${categoryColor}`}>
                            {t.aiCategory}
                          </span>
                        )}
                        {intentConfig && (
                          <span className="hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 sm:inline-flex">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${intentConfig.className}`}>
                              {intentConfig.label}
                            </span>
                            {confidencePct != null && (
                              <span className="hidden items-center gap-0.5 sm:inline-flex" title={`AI confidence: ${confidencePct}%`}>
                                <span className="h-1 w-8 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                  <span
                                    className={`block h-full rounded-full ${intentConfig.barColor} opacity-80`}
                                    style={{ width: `${confidencePct}%` }}
                                  />
                                </span>
                                <span className="text-[10px] text-text-muted">{confidencePct}%</span>
                              </span>
                            )}
                          </span>
                        )}
                        {(t.aiCategory || t.aiIntent) && (
                          <span
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          >
                            <AIFeedback
                              threadId={t.id}
                              feedbackType="classification"
                              aiOutput={{
                                category: t.aiCategory ?? null,
                                priority: t.aiPriority ?? null,
                                intent: t.aiIntent ?? null,
                                confidence: t.aiConfidence ?? null,
                              }}
                            />
                          </span>
                        )}
                      </div>

                      {/* Row 2: Subject */}
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-text-secondary">
                        {t.hasAttachments && <Paperclip size={12} className="shrink-0 text-text-muted" />}
                        {t.hasDraft && (
                          <FileText
                            size={12}
                            className="shrink-0 text-accent"
                            aria-label="Has draft reply"
                          />
                        )}
                        <span className="truncate">{t.subject ?? "(no subject)"}</span>
                      </p>

                      {/* Row 3: AI summary or snippet */}
                      <p className={`mt-0.5 truncate text-xs ${t.aiSummary ? "text-text-secondary" : "text-text-muted"}`}>
                        {t.aiSummary && <Sparkles size={10} className="mr-1 inline shrink-0 text-accent/60" />}
                        {previewText}
                      </p>

                      {/* Row 4: AI tags — hidden on mobile to cap row height;
                          visible on sm+ where rows have more horizontal room */}
                      {t.aiTags && t.aiTags.length > 0 && (
                        <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
                          {t.aiTags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-0.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                            >
                              <Tag size={8} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="shrink-0 pt-0.5 text-xs text-text-muted">
                      {t.lastMessageAt ? relativeTime(t.lastMessageAt) : ""}
                    </span>
                  </Link>
                  {/* Archive button — always visible on touch (no hover state on mobile);
                      uses a minimum 44x44px tap area so thumbs can reliably hit it */}
                  <button
                    type="button"
                    title="Archive thread"
                    disabled={archivingId === t.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void archiveThread(t.id);
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-opacity hover:bg-surface-2 hover:text-text-primary disabled:opacity-40 sm:right-3 sm:h-7 sm:w-7"
                  >
                    {archivingId === t.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Archive size={14} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Load more */}
      {threads.length > 0 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              const params = new URLSearchParams();
              params.set("offset", String(offset));
              if (accountId) params.set("accountId", accountId);
              if (tagId) params.set("tagId", tagId);
              if (q.trim()) params.set("q", q.trim());
              const json = await fetchThreads(params);
              if (!json.error) {
                const next = json.threads ?? [];
                setThreads((prev) => [...prev, ...next]);
                setOffset(json.nextOffset ?? offset + next.length);
              }
              setLoading(false);
            }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />}
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
