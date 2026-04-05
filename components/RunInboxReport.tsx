"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Archive,
  MessageSquare,
  Trash2,
  RotateCcw,
  Loader2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface RunInboxAction {
  id: string;
  actionType: string;
  threadId: string;
  threadSubject?: string | null;
  performedAt: string;
  undone?: boolean;
}

interface RunInboxStats {
  processed: number;
  archived: number;
  replied: number;
  deleted: number;
  actions: RunInboxAction[];
}

interface RunInboxReportProps {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
}

const ACTION_ICONS: Record<string, typeof Inbox> = {
  archive: Archive,
  reply: MessageSquare,
  delete: Trash2,
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RunInboxReport({ open, onClose, sessionId }: RunInboxReportProps) {
  const toast = useToast();
  const router = useRouter();
  const [stats, setStats] = useState<RunInboxStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = sessionId
      ? `/api/run-inbox/status?sessionId=${sessionId}`
      : "/api/run-inbox/status";

    fetch(url)
      .then((r) => r.json())
      .then((data: RunInboxStats) => setStats(data))
      .catch(() => toast.show("Failed to load report", "error"))
      .finally(() => setLoading(false));
  }, [open, sessionId, toast]);

  async function handleUndo(actionId: string) {
    setUndoingId(actionId);
    try {
      const res = await fetch(`/api/audit-log/${actionId}/undo`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Undo failed", "error");
        return;
      }
      toast.show("Action undone.", "success");
      setStats((prev) =>
        prev
          ? {
              ...prev,
              actions: prev.actions.map((a) =>
                a.id === actionId ? { ...a, undone: true } : a,
              ),
            }
          : prev,
      );
    } catch {
      toast.show("Undo failed", "error");
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Run My Inbox — Session Report" size="lg">
      {loading || !stats ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Processed", value: stats.processed, icon: Inbox, color: "text-accent bg-accent-muted" },
              { label: "Archived", value: stats.archived, icon: Archive, color: "text-text-secondary bg-surface-2" },
              { label: "Replied", value: stats.replied, icon: MessageSquare, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400" },
              { label: "Deleted", value: stats.deleted, icon: Trash2, color: "text-danger bg-danger-muted" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-0 p-4 text-center"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${color}`}>
                  <Icon size={18} />
                </div>
                <span className="text-2xl font-bold text-text-primary">{value}</span>
                <span className="text-xs text-text-muted">{label}</span>
              </div>
            ))}
          </div>

          {/* Actions list */}
          {stats.actions.length > 0 ? (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Actions Taken
              </h3>
              <ul className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border">
                {stats.actions.map((action) => {
                  const Icon = ACTION_ICONS[action.actionType] ?? ChevronRight;
                  return (
                    <li
                      key={action.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        action.undone ? "opacity-40" : "hover:bg-surface-2"
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2">
                        <Icon size={14} className="text-text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {action.threadSubject ?? "(no subject)"}
                        </p>
                        <p className="text-xs capitalize text-text-muted">
                          {action.actionType} · {relativeTime(action.performedAt)}
                          {action.undone && " · Undone"}
                        </p>
                      </div>
                      {!action.undone && (
                        <button
                          type="button"
                          disabled={undoingId === action.id}
                          onClick={() => handleUndo(action.id)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                        >
                          {undoingId === action.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <RotateCcw size={11} />
                          )}
                          Undo
                        </button>
                      )}
                      {action.undone && (
                        <CheckCircle2 size={15} className="shrink-0 text-success" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 size={28} className="text-success" strokeWidth={1.5} />
              <p className="text-sm font-medium text-text-primary">No actions were taken</p>
              <p className="text-xs text-text-muted">AI monitored your inbox but found nothing to action.</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/inbox");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Inbox size={15} />
              Back to Inbox
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
