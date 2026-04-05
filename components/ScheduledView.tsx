"use client";

import { useEffect, useState } from "react";
import { Clock, Send, X, Loader2, Edit2, Check, Square, CheckSquare, Minus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useBulkSelection } from "@/hooks/useBulkSelection";

interface ScheduledMessage {
  id: string;
  to: string;
  subject: string;
  scheduledAt: string;
  status: "pending" | "sent" | "cancelled" | "failed";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<ScheduledMessage["status"], string> = {
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  sent: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_LABELS: Record<ScheduledMessage["status"], string> = {
  pending: "Scheduled",
  sent: "Sent",
  cancelled: "Cancelled",
  failed: "Failed",
};

interface EditingState {
  id: string;
  scheduledAt: string;
}

export function ScheduledView() {
  const toast = useToast();
  const bulk = useBulkSelection();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkCancelling, setBulkCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchScheduled() {
      setLoading(true);
      try {
        const res = await fetch("/api/scheduled");
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { messages?: ScheduledMessage[] };
        if (!cancelled) setMessages(data.messages ?? []);
      } catch {
        if (!cancelled) toast.show("Failed to load scheduled messages", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchScheduled();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancel(id: string) {
    if (!confirm("Cancel this scheduled message?")) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/scheduled/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "cancelled" as const } : m))
      );
      toast.show("Message cancelled.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editing || editing.id !== id) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/scheduled/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scheduledAt: new Date(editing.scheduledAt).toISOString() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, scheduledAt: new Date(editing.scheduledAt).toISOString() } : m
        )
      );
      setEditing(null);
      toast.show("Schedule updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleBulkCancel() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Cancel ${ids.length} scheduled message${ids.length === 1 ? "" : "s"}?`)) return;

    setBulkCancelling(true);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/scheduled/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "cancelled" }),
        })
      )
    );

    const succeeded: string[] = [];
    const failed: string[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled" && result.value.ok) {
        succeeded.push(ids[i]);
      } else {
        failed.push(ids[i]);
      }
    });

    if (succeeded.length > 0) {
      setMessages((prev) =>
        prev.map((m) =>
          succeeded.includes(m.id) ? { ...m, status: "cancelled" as const } : m
        )
      );
    }

    bulk.deselectAll();
    setBulkCancelling(false);

    if (failed.length === 0) {
      toast.show(
        `${succeeded.length} message${succeeded.length === 1 ? "" : "s"} cancelled.`,
        "success"
      );
    } else if (succeeded.length === 0) {
      toast.show("Failed to cancel selected messages.", "error");
    } else {
      toast.show(
        `${succeeded.length} cancelled, ${failed.length} failed.`,
        "error"
      );
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-1 p-4">
            <Skeleton className="mb-2 h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  const pending = messages.filter((m) => m.status === "pending");
  const others = messages.filter((m) => m.status !== "pending");

  // Only pending messages are selectable
  const pendingIds = pending.map((m) => m.id);
  const allPendingSelected =
    pendingIds.length > 0 && pendingIds.every((id) => bulk.isSelected(id));
  const somePendingSelected = bulk.selectionCount > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {messages.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No scheduled messages"
          description="Messages you schedule to send later will appear here."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Pending ({pending.length})
              </h2>

              {/* Select-all header row */}
              <div className="flex items-center gap-3 rounded-t-xl border border-b-0 border-border bg-surface-0 px-4 py-2">
                <button
                  type="button"
                  onClick={() => {
                    if (allPendingSelected) {
                      bulk.deselectAll();
                    } else {
                      bulk.selectAll(pendingIds);
                    }
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
                  aria-label={allPendingSelected ? "Deselect all" : "Select all"}
                >
                  {allPendingSelected ? (
                    <CheckSquare size={16} className="text-accent" />
                  ) : somePendingSelected ? (
                    <Minus size={16} className="text-accent" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
                <span className="text-xs text-text-muted">
                  {somePendingSelected
                    ? `${bulk.selectionCount} of ${pending.length} selected`
                    : `${pending.length} pending`}
                </span>
                {!somePendingSelected && (
                  <button
                    type="button"
                    onClick={() => bulk.selectAll(pendingIds)}
                    className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                  >
                    Select all
                  </button>
                )}
              </div>

              {/* Bulk actions toolbar */}
              {somePendingSelected && (
                <div className="flex items-center gap-3 border border-b-0 border-border bg-accent/5 px-4 py-2.5">
                  <span className="text-xs font-medium text-text-secondary">
                    {bulk.selectionCount} selected
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleBulkCancel()}
                      disabled={bulkCancelling}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-danger/30 bg-danger-muted px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                    >
                      {bulkCancelling ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                      {bulkCancelling ? "Cancelling..." : "Cancel All"}
                    </button>
                    <button
                      type="button"
                      onClick={() => bulk.deselectAll()}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-2 sm:min-h-0 sm:py-1.5"
                    >
                      Deselect
                    </button>
                  </div>
                </div>
              )}

              <ul className="space-y-0 overflow-hidden rounded-b-xl border border-border shadow-xs">
                {pending.map((msg, idx) => (
                  <li
                    key={msg.id}
                    className={`flex items-center gap-4 bg-surface-1 px-4 py-3.5 transition-colors ${
                      bulk.isSelected(msg.id) ? "bg-accent/5" : ""
                    } ${idx < pending.length - 1 ? "border-b border-border" : ""}`}
                  >
                    {/* Checkbox — 44px touch target on mobile */}
                    <button
                      type="button"
                      onClick={() => bulk.toggle(msg.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-accent sm:h-auto sm:w-auto sm:p-0.5"
                      aria-label={bulk.isSelected(msg.id) ? "Deselect message" : "Select message"}
                    >
                      {bulk.isSelected(msg.id) ? (
                        <CheckSquare size={16} className="text-accent" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{msg.subject}</p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">To: {msg.to}</p>
                      {editing?.id === msg.id ? (
                        /* Stacked layout on mobile to prevent datetime-local overflow */
                        <div className="mt-2 flex flex-col gap-2">
                          <input
                            type="datetime-local"
                            value={editing.scheduledAt}
                            onChange={(e) => setEditing({ id: msg.id, scheduledAt: e.target.value })}
                            className="w-full rounded-lg border border-border bg-surface-0 px-2 py-2 text-xs text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-auto sm:py-1"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(msg.id)}
                              disabled={savingId === msg.id}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-2.5 py-2.5 text-xs font-medium text-accent-text hover:bg-accent-hover disabled:opacity-50 sm:flex-none sm:py-1"
                            >
                              {savingId === msg.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="flex-1 rounded-lg border border-border px-2.5 py-2.5 text-xs text-text-muted hover:bg-surface-2 sm:flex-none sm:py-1"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                          <Clock size={11} />
                          {formatDateTime(msg.scheduledAt)}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[msg.status]}`}>
                        {STATUS_LABELS[msg.status]}
                      </span>
                      {!editing || editing.id !== msg.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            const dt = new Date(msg.scheduledAt);
                            const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
                              .toISOString()
                              .slice(0, 16);
                            setEditing({ id: msg.id, scheduledAt: local });
                          }}
                          className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                          title="Edit schedule"
                        >
                          <Edit2 size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCancel(msg.id)}
                        disabled={cancellingId === msg.id}
                        className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
                        title="Cancel"
                      >
                        {cancellingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                History
              </h2>
              <ul className="space-y-2">
                {others.map((msg) => (
                  <li
                    key={msg.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-surface-1 px-4 py-3.5 opacity-70 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{msg.subject}</p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">To: {msg.to}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                        <Clock size={11} />
                        {formatDateTime(msg.scheduledAt)}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[msg.status]}`}>
                      {STATUS_LABELS[msg.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
