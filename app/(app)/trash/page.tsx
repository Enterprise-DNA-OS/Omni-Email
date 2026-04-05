"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonThreadRow } from "@/components/Skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface TrashedThread {
  id: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  senderName: string | null;
  senderEmail: string | null;
  deletedAt: string | null;
}

function daysUntilPermanentDelete(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const RETENTION_DAYS = 30;
  const deleteDate = new Date(deletedAt);
  const purgeDate = new Date(deleteDate.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = purgeDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
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

export default function TrashPage() {
  const toast = useToast();
  const [threads, setThreads] = useState<TrashedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  async function fetchTrash() {
    setLoading(true);
    try {
      const res = await fetch("/api/threads?trash=true&limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: TrashedThread[] };
      setThreads(data.threads ?? []);
    } catch {
      toast.show("Failed to load trash", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestore(threadId: string) {
    setRestoringId(threadId);
    try {
      const res = await fetch(`/api/threads/${threadId}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Restore failed", "error");
        return;
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      toast.show("Thread restored to inbox.", "success");
    } catch {
      toast.show("Restore failed", "error");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleEmptyTrash() {
    setConfirmEmpty(false);
    setEmptyingTrash(true);
    try {
      const res = await fetch("/api/threads/empty-trash", { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to empty trash", "error");
        return;
      }
      setThreads([]);
      toast.show("Trash emptied permanently.", "info");
    } catch {
      toast.show("Failed to empty trash", "error");
    } finally {
      setEmptyingTrash(false);
    }
  }

  const senderDisplay = (t: TrashedThread) =>
    t.senderName ?? t.senderEmail ?? "Unknown sender";

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="animate-fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Trash</h1>
          <p className="mt-1 text-sm text-text-muted">
            Deleted threads. Items are permanently removed after 30 days.
          </p>
        </div>
        {threads.length > 0 && (
          <button
            type="button"
            disabled={emptyingTrash}
            onClick={() => setConfirmEmpty(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-muted px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
          >
            {emptyingTrash ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            {emptyingTrash ? "Emptying..." : "Empty Trash"}
          </button>
        )}
      </div>

      {/* Thread list */}
      <div className="animate-slide-up overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xs">
        {loading ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonThreadRow key={i} />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Deleted threads will appear here for 30 days before being permanently removed."
            action={
              <Link
                href="/inbox"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
              >
                Back to Inbox
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border-muted">
            {threads.map((t) => {
              const daysLeft = daysUntilPermanentDelete(t.deletedAt);
              const urgentDelete = daysLeft !== null && daysLeft <= 3;

              return (
                <li
                  key={t.id}
                  className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
                >
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {senderDisplay(t)}
                      </span>
                      {daysLeft !== null && (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            urgentDelete
                              ? "bg-danger-muted text-danger"
                              : "bg-surface-2 text-text-muted"
                          }`}
                          title="Days until permanent deletion"
                        >
                          {urgentDelete && <AlertTriangle size={9} />}
                          Deleted in {daysLeft}d
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-text-secondary">
                      {t.subject ?? "(no subject)"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      {t.snippet}
                    </p>
                  </div>

                  {/* Time + Restore */}
                  <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
                    <span className="text-xs text-text-muted">
                      {t.lastMessageAt ? relativeTime(t.lastMessageAt) : ""}
                    </span>
                    <button
                      type="button"
                      disabled={restoringId === t.id}
                      onClick={() => handleRestore(t.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary opacity-0 transition-all hover:bg-surface-2 group-hover:opacity-100 disabled:opacity-50"
                      aria-label="Restore thread"
                    >
                      {restoringId === t.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RotateCcw size={11} />
                      )}
                      Restore
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirm empty trash dialog */}
      <ConfirmDialog
        open={confirmEmpty}
        title="Empty Trash?"
        description="All trashed threads will be permanently deleted immediately. This cannot be undone."
        confirmLabel="Empty Trash"
        onConfirm={handleEmptyTrash}
        onClose={() => setConfirmEmpty(false)}
        variant="danger"
      />
    </div>
  );
}
