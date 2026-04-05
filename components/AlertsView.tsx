"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Star,
  AlertTriangle,
  Loader2,
  Square,
  CheckSquare,
  Minus,
  Archive,
  Mail,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useBulkSelection } from "@/hooks/useBulkSelection";

type AlertSignal = "risk" | "opportunity";
type AlertSeverity = "high" | "medium" | "low";

interface ThreadAlert {
  threadId: string;
  subject: string | null;
  snippet: string | null;
  sender: string | null;
  lastMessageAt: string | null;
  signal: AlertSignal;
  severity: AlertSeverity;
  reason: string | null;
}

type TabFilter = "all" | "risks" | "opportunities";

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

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function SignalBadge({ signal, severity }: { signal: AlertSignal; severity: AlertSeverity }) {
  if (signal === "risk") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
          <ShieldAlert size={11} />
          Risk
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLES[severity]}`}>
          {severity.charAt(0).toUpperCase() + severity.slice(1)}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <Star size={11} />
        Opportunity
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLES[severity]}`}>
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </span>
    </div>
  );
}

export function AlertsView() {
  const toast = useToast();
  const bulk = useBulkSelection();
  const [alerts, setAlerts] = useState<ThreadAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/threads/alerts");
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { alerts?: ThreadAlert[] };
        if (!cancelled) setAlerts(data.alerts ?? []);
      } catch {
        if (!cancelled) toast.show("Failed to load alerts", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = alerts.filter((a) => {
    if (tab === "risks") return a.signal === "risk";
    if (tab === "opportunities") return a.signal === "opportunity";
    return true;
  });

  const riskCount = alerts.filter((a) => a.signal === "risk").length;
  const opCount = alerts.filter((a) => a.signal === "opportunity").length;

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: alerts.length },
    { key: "risks", label: "Risks", count: riskCount },
    { key: "opportunities", label: "Opportunities", count: opCount },
  ];

  async function bulkArchive() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    let failCount = 0;
    await Promise.all(
      ids.map(async (threadId) => {
        try {
          const res = await fetch(`/api/threads/${threadId}/archive`, {
            method: "POST",
            credentials: "include",
          });
          if (!res.ok) failCount++;
        } catch {
          failCount++;
        }
      }),
    );
    setBulkLoading(false);
    if (failCount > 0) {
      toast.show(`${failCount} archive(s) failed`, "error");
    } else {
      toast.show(`${ids.length} alert(s) archived`, "success");
    }
    setAlerts((prev) => prev.filter((a) => !bulk.selectedIds.has(a.threadId)));
    bulk.deselectAll();
  }

  async function bulkMarkRead() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    let failCount = 0;
    await Promise.all(
      ids.map(async (threadId) => {
        try {
          const res = await fetch(`/api/threads/${threadId}/read`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ read: true }),
          });
          if (!res.ok) failCount++;
        } catch {
          failCount++;
        }
      }),
    );
    setBulkLoading(false);
    if (failCount > 0) {
      toast.show(`${failCount} mark-read(s) failed`, "error");
    } else {
      toast.show(`${ids.length} alert(s) marked read`, "success");
    }
    bulk.deselectAll();
  }

  const allFilteredIds = filtered.map((a) => a.threadId);
  const allSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => bulk.isSelected(id));
  const someSelected = bulk.selectionCount > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tabs */}
      <div className="border-b border-border bg-surface-1 px-4 sm:px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                bulk.deselectAll();
              }}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    tab === t.key
                      ? "bg-accent text-accent-text"
                      : "bg-surface-2 text-text-muted"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface-1 p-4">
                <Skeleton className="mb-2 h-4 w-64" />
                <Skeleton className="mb-2 h-3 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={tab === "all" ? "No alerts" : tab === "risks" ? "No risks detected" : "No opportunities detected"}
            description="AI-detected risks and opportunities from your inbox will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xs">
            {/* Select-all header row */}
            <div className="flex items-center gap-3 border-b border-border bg-surface-0 px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  if (allSelected) {
                    bulk.deselectAll();
                  } else {
                    bulk.selectAll(allFilteredIds);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
                aria-label={allSelected ? "Deselect all" : "Select all"}
              >
                {allSelected ? (
                  <CheckSquare size={16} className="text-accent" />
                ) : someSelected ? (
                  <Minus size={16} className="text-accent" />
                ) : (
                  <Square size={16} />
                )}
              </button>
              <span className="text-xs text-text-muted">
                {someSelected
                  ? `${bulk.selectionCount} of ${filtered.length} selected`
                  : `${filtered.length} alert${filtered.length !== 1 ? "s" : ""}`}
              </span>
              {!someSelected && (
                <button
                  type="button"
                  onClick={() => bulk.selectAll(allFilteredIds)}
                  className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  Select all
                </button>
              )}
            </div>

            {/* Bulk actions toolbar */}
            {someSelected && (
              <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-4 py-2">
                <span className="mr-1 text-xs font-medium text-text-secondary">
                  {bulk.selectionCount} selected
                </span>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void bulkArchive()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                >
                  {bulkLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Archive size={13} />
                  )}
                  Archive All
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void bulkMarkRead()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                >
                  {bulkLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Mail size={13} />
                  )}
                  Mark Read
                </button>
                <button
                  type="button"
                  onClick={bulk.deselectAll}
                  className="ml-auto text-xs text-text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            )}

            <ul className="divide-y divide-border-muted">
              {filtered.map((alert) => (
                <li
                  key={`${alert.threadId}-${alert.signal}`}
                  className={`group relative transition-colors ${
                    bulk.isSelected(alert.threadId) ? "bg-accent/5" : ""
                  }`}
                >
                  <div className="rounded-none border-0 bg-transparent p-4 shadow-none transition-shadow hover:bg-surface-2">
                    <div className="flex items-start gap-3">
                      {/* Checkbox — always-visible touch target (44x44px), fades on desktop */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          bulk.toggle(alert.threadId);
                        }}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-all hover:text-accent sm:h-8 sm:w-8 ${
                          bulk.isSelected(alert.threadId) || someSelected
                            ? "opacity-100"
                            : "opacity-0 focus:opacity-100 group-hover:opacity-100"
                        }`}
                        aria-label={
                          bulk.isSelected(alert.threadId)
                            ? "Deselect alert"
                            : "Select alert"
                        }
                      >
                        {bulk.isSelected(alert.threadId) ? (
                          <CheckSquare size={16} className="text-accent" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>

                      <div className={`mt-0.5 rounded-lg p-2 ${alert.signal === "risk" ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                        {alert.signal === "risk" ? (
                          <ShieldAlert size={16} className="text-red-600 dark:text-red-400" />
                        ) : (
                          <Star size={16} className="text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <SignalBadge signal={alert.signal} severity={alert.severity} />
                        </div>
                        <Link
                          href={`/thread/${alert.threadId}`}
                          className="block truncate text-sm font-semibold text-text-primary hover:text-accent"
                        >
                          {alert.subject ?? "(no subject)"}
                        </Link>
                        {alert.sender && (
                          <p className="mt-0.5 text-xs text-text-muted">From: {alert.sender}</p>
                        )}
                        {alert.reason && (
                          <p className="mt-2 text-xs italic text-text-secondary">{alert.reason}</p>
                        )}
                        {alert.snippet && !alert.reason && (
                          <p className="mt-1 line-clamp-2 text-xs text-text-muted">{alert.snippet}</p>
                        )}
                        {alert.lastMessageAt && (
                          <p className="mt-1.5 text-xs text-text-muted">
                            {relativeTime(alert.lastMessageAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
