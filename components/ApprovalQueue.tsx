"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Shield,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

interface QueueItem {
  id: string;
  threadId: string;
  proposedAction: string;
  proposedDetails: Record<string, unknown>;
  confidence: number;
  reasoning: string | null;
  status: string;
  resolvedAt: string | null;
  expiresAt: string;
  createdAt: string;
  thread: {
    subject: string;
    snippet: string | null;
    senderName: string | null;
    senderEmail: string | null;
  } | null;
}

interface ApprovalQueueResponse {
  items: QueueItem[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number;
}

const ACTION_COLORS: Record<string, string> = {
  archive: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  label: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  unsubscribe: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const ACTION_LABELS: Record<string, string> = {
  archive: "Archive",
  delete: "Delete",
  label: "Add Label",
  unsubscribe: "Unsubscribe",
};

const PAGE_LIMIT = 15;

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75
      ? "bg-green-500"
      : pct >= 60
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-text-muted">{pct}%</span>
    </div>
  );
}

export function ApprovalQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const fetchItems = useCallback(async (off: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/approval-queue?status=pending&limit=${PAGE_LIMIT}&offset=${off}`,
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to load approvals");
      }
      const data = (await res.json()) as ApprovalQueueResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems(offset);
  }, [fetchItems, offset]);

  // Reset selection when page changes
  useEffect(() => {
    setSelected(new Set());
  }, [offset]);

  const allIds = items.map((i) => i.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function resolveOne(id: string, action: "approve" | "reject") {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/approval-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Request failed");
      }
      // Remove from local state
      setItems((prev) => prev.filter((i) => i.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to process item");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function batchResolve(action: "approve" | "reject") {
    if (!someSelected) return;
    setBatchProcessing(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/approval-queue/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Batch request failed");
      }
      const result = (await res.json()) as { processed: number; errors: string[] };
      if (result.errors.length > 0) {
        alert(`Completed with ${result.errors.length} error(s):\n${result.errors.join("\n")}`);
      }
      // Refresh current page
      await fetchItems(offset);
      setSelected(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Batch operation failed");
    } finally {
      setBatchProcessing(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_LIMIT);
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted">
        <Loader2 size={28} className="animate-spin mb-3" />
        <p className="text-sm">Loading approvals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted">
        <AlertCircle size={28} className="mb-3 text-red-500" />
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={() => void fetchItems(offset)}
          className="mt-4 rounded-lg bg-surface-2 px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-3"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-text-muted">
        <ShieldCheck size={48} className="mb-4 text-green-500" strokeWidth={1.5} />
        <p className="text-base font-medium text-text-primary">All clear!</p>
        <p className="mt-1 text-sm">No pending approvals.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3">
        {/* Checkbox wrapped in label for larger touch target */}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-border accent-accent"
            aria-label="Select all"
          />
          <span className="text-sm text-text-muted">
            {someSelected ? `${selected.size} selected` : `${total} pending approval${total !== 1 ? "s" : ""}`}
          </span>
        </label>
        {someSelected && (
          /* Batch buttons stack to full-width on mobile for easy thumb reach */
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
            <button
              onClick={() => void batchResolve("approve")}
              disabled={batchProcessing}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:flex-none sm:py-1.5 sm:text-xs"
            >
              {batchProcessing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle size={13} />
              )}
              Approve All
            </button>
            <button
              onClick={() => void batchResolve("reject")}
              disabled={batchProcessing}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:flex-none sm:py-1.5 sm:text-xs"
            >
              <XCircle size={13} />
              Reject All
            </button>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const isProcessing = processing.has(item.id);
          const isSelected = selected.has(item.id);
          const actionLabel = ACTION_LABELS[item.proposedAction] ?? item.proposedAction;
          const actionColor =
            ACTION_COLORS[item.proposedAction] ??
            "bg-surface-2 text-text-secondary";

          return (
            <div
              key={item.id}
              className={`rounded-xl border bg-surface-1 p-4 transition-colors ${
                isSelected ? "border-accent/60" : "border-border"
              } ${isProcessing ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                {/* Selection checkbox — wrapped in label for larger touch target */}
                <label className="mt-1 flex cursor-pointer items-center p-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(item.id)}
                    className="h-4 w-4 rounded border-border accent-accent"
                    disabled={isProcessing}
                    aria-label={`Select ${item.thread?.subject ?? "item"}`}
                  />
                </label>

                <div className="min-w-0 flex-1">
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/thread/${item.threadId}`}
                      className="truncate text-sm font-semibold text-text-primary hover:underline"
                    >
                      {item.thread?.subject ?? "(no subject)"}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${actionColor}`}
                    >
                      {actionLabel}
                    </span>
                  </div>

                  {/* Sender */}
                  {(item.thread?.senderName ?? item.thread?.senderEmail) && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      {item.thread?.senderName
                        ? `${item.thread.senderName} <${item.thread.senderEmail ?? ""}>`
                        : item.thread?.senderEmail}
                    </p>
                  )}

                  {/* Snippet */}
                  {item.thread?.snippet && (
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                      {item.thread.snippet}
                    </p>
                  )}

                  {/* Confidence + reasoning */}
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Shield size={12} className="shrink-0 text-text-muted" />
                      <span className="text-xs text-text-muted">AI confidence</span>
                      <ConfidenceMeter value={item.confidence} />
                    </div>

                    {item.reasoning && (
                      <p className="text-xs italic text-text-muted">
                        &ldquo;{item.reasoning}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons — full-width row at card footer for easy thumb access */}
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <button
                  onClick={() => void resolveOne(item.id, "approve")}
                  disabled={isProcessing}
                  title="Approve"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle size={14} />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => void resolveOne(item.id, "reject")}
                  disabled={isProcessing}
                  title="Reject"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-400 px-3 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-text-muted">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
              disabled={offset === 0 || loading}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_LIMIT)}
              disabled={offset + PAGE_LIMIT >= total || loading}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
