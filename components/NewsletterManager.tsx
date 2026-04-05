"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Newspaper,
  ChevronDown,
  Loader2,
  X,
  MailX,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import type { NewsletterItem, UnsubscribeStatus } from "@/app/api/newsletters/route";

// ─── Utility helpers ─────────────────────────────────────────────────────────

const DOMAIN_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function domainColor(domain: string | null): string {
  if (!domain) return DOMAIN_COLORS[0];
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) & 0xffffffff;
  }
  return DOMAIN_COLORS[Math.abs(hash) % DOMAIN_COLORS.length];
}

function senderInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (parts[0][0] ?? email[0]).toUpperCase();
  }
  return email[0].toUpperCase();
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  UnsubscribeStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  subscribed: {
    label: "Subscribed",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: CheckCircle2,
  },
  unsubscribed: {
    label: "Unsubscribed",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    icon: Clock,
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    icon: AlertCircle,
  },
};

function StatusBadge({ status }: { status: UnsubscribeStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Newsletter row skeleton ───────────────────────────────────────────────────

function NewsletterRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="h-4 w-4 shrink-0 rounded" />
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-3 w-56 rounded" />
      </div>
      <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
      <Skeleton className="h-3 w-16 shrink-0 rounded" />
      <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
      <Skeleton className="h-6 w-24 shrink-0 rounded-lg" />
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type StatusFilter = "all" | "subscribed" | "unsubscribed";
type SortOption = "recent" | "count";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "subscribed", label: "Subscribed" },
  { key: "unsubscribed", label: "Unsubscribed" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function NewsletterManager() {
  const toast = useToast();

  const [newsletters, setNewsletters] = useState<NewsletterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { selectedIds, toggle, selectAll, deselectAll, isSelected, selectionCount } =
    useBulkSelection();

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchNewsletters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await fetch(`/api/newsletters?${params.toString()}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to load newsletters", "error");
        return;
      }
      const data = (await res.json()) as { newsletters: NewsletterItem[] };
      setNewsletters(data.newsletters ?? []);
    } catch {
      toast.show("Failed to load newsletters", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sort, debouncedSearch, toast]);

  useEffect(() => {
    void fetchNewsletters();
  }, [fetchNewsletters]);

  // Clear selection when list changes
  useEffect(() => {
    deselectAll();
  }, [newsletters, deselectAll]);

  async function handleUnsubscribeOne(senderEmail: string) {
    setUnsubscribingId(senderEmail);
    try {
      const res = await fetch("/api/newsletters/bulk-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderEmails: [senderEmail] }),
      });
      const data = (await res.json()) as {
        results?: Array<{ senderEmail: string; success: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok || !data.results) {
        toast.show(data.error ?? "Unsubscribe failed", "error");
        return;
      }
      const result = data.results[0];
      if (result?.success) {
        toast.show(`Unsubscribed from ${senderEmail}`, "success");
        void fetchNewsletters();
      } else {
        toast.show(result?.error ?? "Unsubscribe failed", "error");
      }
    } catch {
      toast.show("Unsubscribe failed", "error");
    } finally {
      setUnsubscribingId(null);
    }
  }

  async function handleBulkUnsubscribe() {
    const emails = Array.from(selectedIds);
    if (emails.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/newsletters/bulk-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderEmails: emails }),
      });
      const data = (await res.json()) as {
        results?: Array<{ senderEmail: string; success: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok || !data.results) {
        toast.show(data.error ?? "Bulk unsubscribe failed", "error");
        return;
      }
      const succeeded = data.results.filter((r) => r.success).length;
      const failed = data.results.length - succeeded;
      if (succeeded > 0 && failed === 0) {
        toast.show(
          `Unsubscribed from ${succeeded} sender${succeeded !== 1 ? "s" : ""}`,
          "success",
        );
      } else if (succeeded > 0) {
        toast.show(
          `Unsubscribed from ${succeeded}, failed for ${failed}`,
          "info",
        );
      } else {
        toast.show("All unsubscribe attempts failed", "error");
      }
      deselectAll();
      void fetchNewsletters();
    } catch {
      toast.show("Bulk unsubscribe failed", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  const subscribedEmails = newsletters
    .filter(
      (n) =>
        n.unsubscribeStatus === "subscribed" || n.unsubscribeStatus === "failed",
    )
    .map((n) => n.senderEmail);

  const allSubscribedSelected =
    subscribedEmails.length > 0 &&
    subscribedEmails.every((e) => isSelected(e));

  function handleSelectAllSubscribed() {
    if (allSubscribedSelected) {
      deselectAll();
    } else {
      selectAll(subscribedEmails);
    }
  }

  const totalCount = newsletters.length;
  const subscribedCount = newsletters.filter(
    (n) =>
      n.unsubscribeStatus === "subscribed" || n.unsubscribeStatus === "failed",
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b border-border bg-surface-1 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              Newsletter Manager
            </h1>
            <p className="mt-0.5 text-sm text-text-muted">
              {loading
                ? "Loading subscriptions..."
                : `${totalCount} newsletter${totalCount !== 1 ? "s" : ""} detected${subscribedCount > 0 ? ` · ${subscribedCount} active` : ""}`}
            </p>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Status filter pills */}
          <div className="flex gap-1 rounded-lg border border-border bg-surface-0 p-1">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? "bg-surface-1 text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search senders..."
              className="w-full rounded-lg border border-border bg-surface-0 py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="appearance-none rounded-lg border border-border bg-surface-0 py-1.5 pl-3 pr-7 text-xs text-text-secondary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="recent">Most recent</option>
              <option value="count">Most emails</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted"
            />
          </div>
        </div>
      </div>

      {/* ── Bulk toolbar ── */}
      {selectionCount > 0 && (
        <div className="border-b border-accent/20 bg-accent/5 px-6 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text-primary">
              {selectionCount} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkUnsubscribe()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {bulkBusy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <MailX size={12} />
              )}
              Unsubscribe from {selectionCount} selected
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <X size={13} />
              Deselect all
            </button>
          </div>
        </div>
      )}

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 8 }).map((_, i) => (
              <NewsletterRowSkeleton key={i} />
            ))}
          </div>
        ) : newsletters.length === 0 ? (
          search || statusFilter !== "all" ? (
            <EmptyState
              icon={Search}
              title="No results"
              description="Try adjusting your filters or search query."
            />
          ) : (
            <EmptyState
              icon={Newspaper}
              title="No newsletters detected"
              description="Newsletters and mailing list emails will appear here automatically once they arrive in your inbox."
            />
          )
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 z-10 border-b border-border bg-surface-1">
              <div className="flex items-center gap-3 px-4 py-2.5">
                {/* Select all checkbox */}
                <input
                  type="checkbox"
                  checked={allSubscribedSelected}
                  onChange={handleSelectAllSubscribed}
                  disabled={subscribedEmails.length === 0}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                  title="Select all subscribed"
                />
                <span className="flex-1 text-xs font-medium text-text-muted">
                  Sender
                </span>
                <span className="hidden w-16 shrink-0 text-right text-xs font-medium text-text-muted sm:block">
                  Emails
                </span>
                <span className="hidden w-24 shrink-0 text-right text-xs font-medium text-text-muted md:block">
                  Last received
                </span>
                <span className="w-24 shrink-0 text-center text-xs font-medium text-text-muted">
                  Status
                </span>
                <span className="w-28 shrink-0" />
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border-muted">
              {newsletters.map((item) => {
                const canUnsubscribe =
                  item.hasListUnsubscribe &&
                  (item.unsubscribeStatus === "subscribed" ||
                    item.unsubscribeStatus === "failed");
                const isBusy = unsubscribingId === item.senderEmail;
                const selected = isSelected(item.senderEmail);

                return (
                  <div
                    key={item.senderEmail}
                    className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
                      selected ? "bg-accent/5" : "hover:bg-surface-2"
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(item.senderEmail)}
                      disabled={!canUnsubscribe && !selected}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-30"
                    />

                    {/* Avatar */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${domainColor(item.domain)}`}
                    >
                      {senderInitials(item.senderName, item.senderEmail)}
                    </div>

                    {/* Sender info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {item.senderName ?? item.senderEmail}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {item.senderName ? item.senderEmail : item.domain ?? ""}
                      </p>
                    </div>

                    {/* Message count */}
                    <span className="hidden w-16 shrink-0 text-right text-xs text-text-muted sm:block">
                      {item.messageCount} email{item.messageCount !== 1 ? "s" : ""}
                    </span>

                    {/* Last received */}
                    <span className="hidden w-24 shrink-0 text-right text-xs text-text-muted md:block">
                      {relativeDate(item.lastReceived)}
                    </span>

                    {/* Status badge */}
                    <div className="w-24 shrink-0 text-center">
                      <StatusBadge status={item.unsubscribeStatus} />
                    </div>

                    {/* Action */}
                    <div className="w-28 shrink-0 text-right">
                      {canUnsubscribe ? (
                        <button
                          type="button"
                          disabled={isBusy || bulkBusy}
                          onClick={() =>
                            void handleUnsubscribeOne(item.senderEmail)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary opacity-0 transition-all hover:border-danger/30 hover:bg-danger-muted hover:text-danger group-hover:opacity-100 disabled:opacity-40"
                        >
                          {isBusy ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <MailX size={11} />
                          )}
                          Unsubscribe
                        </button>
                      ) : item.unsubscribeStatus === "unsubscribed" ||
                        item.unsubscribeStatus === "pending" ? (
                        <span className="text-xs text-text-muted opacity-0 group-hover:opacity-60">
                          {item.unsubscribeStatus === "pending"
                            ? "Processing..."
                            : "Done"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
