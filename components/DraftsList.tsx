"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Send,
  Trash2,
  Pencil,
  Loader2,
  Square,
  CheckSquare,
  Minus,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useBulkSelection } from "@/hooks/useBulkSelection";

interface Draft {
  id: string;
  threadId: string | null;
  threadSubject: string | null;
  preview: string | null;
  tone: string | null;
  createdAt: string;
  to: string | null;
}

const TONE_COLORS: Record<string, string> = {
  professional: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  friendly: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  formal: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  concise: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  empathetic: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DraftsList() {
  const toast = useToast();
  const bulk = useBulkSelection();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<Draft | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/drafts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { drafts?: Draft[]; error?: string };
      setDrafts(data.drafts ?? []);
    } catch {
      toast.show("Failed to load drafts", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  async function handleSend(draft: Draft) {
    setSendingId(draft.id);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/send`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to send", "error");
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.show("Draft sent.", "success");
    } catch {
      toast.show("Failed to send draft", "error");
    } finally {
      setSendingId(null);
    }
  }

  async function handleDiscard(draft: Draft) {
    setDiscardingId(draft.id);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.show("Failed to discard draft", "error");
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.show("Draft discarded.", "info");
    } catch {
      toast.show("Failed to discard draft", "error");
    } finally {
      setDiscardingId(null);
      setConfirmDiscard(null);
    }
  }

  function openEdit(draft: Draft) {
    setEditingDraft(draft);
    setEditBody(draft.preview ?? "");
  }

  async function handleSaveEdit() {
    if (!editingDraft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/drafts/${editingDraft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      });
      if (!res.ok) {
        toast.show("Failed to save draft", "error");
        return;
      }
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === editingDraft.id ? { ...d, preview: editBody } : d,
        ),
      );
      toast.show("Draft saved.", "success");
      setEditingDraft(null);
    } catch {
      toast.show("Failed to save draft", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(bulk.selectedIds);
    setBulkWorking(true);
    let failed = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
      }),
    );
    setDrafts((prev) => prev.filter((d) => !bulk.selectedIds.has(d.id)));
    bulk.deselectAll();
    setBulkWorking(false);
    if (failed > 0) {
      toast.show(`${failed} draft(s) failed to delete`, "error");
    } else {
      toast.show(`${ids.length} draft(s) deleted.`, "info");
    }
  }

  async function handleBulkSend() {
    const ids = Array.from(bulk.selectedIds);
    setBulkWorking(true);
    let failed = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/drafts/${id}/send`, { method: "POST" });
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
      }),
    );
    setDrafts((prev) => prev.filter((d) => !bulk.selectedIds.has(d.id)));
    bulk.deselectAll();
    setBulkWorking(false);
    if (failed > 0) {
      toast.show(`${failed} draft(s) failed to send`, "error");
    } else {
      toast.show(`${ids.length} draft(s) sent.`, "success");
    }
  }

  return (
    <>
      {/* Bulk actions toolbar — rendered above the list when items are selected */}
      {bulk.selectionCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-1 px-4 py-2.5 shadow-xs">
          <span className="min-w-0 flex-1 text-sm font-medium text-text-primary">
            {bulk.selectionCount} draft{bulk.selectionCount !== 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            disabled={bulkWorking}
            onClick={() => void handleBulkSend()}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50 sm:h-9"
          >
            {bulkWorking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Send All
          </button>
          <button
            type="button"
            disabled={bulkWorking}
            onClick={() => void handleBulkDelete()}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-danger/40 bg-danger-muted px-4 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-50 sm:h-9"
          >
            {bulkWorking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete
          </button>
          <button
            type="button"
            onClick={bulk.deselectAll}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 sm:h-9"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        {loading ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-4">
                <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/5 rounded" />
                  <Skeleton className="h-3 w-4/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No drafts"
            description="AI-generated draft replies will appear here for your review before sending."
          />
        ) : (
          <>
            {/* Select-all header row */}
            <div className="flex items-center gap-3 border-b border-border bg-surface-0 px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  const allIds = drafts.map((d) => d.id);
                  const allSelected = allIds.every((id) => bulk.isSelected(id));
                  if (allSelected) {
                    bulk.deselectAll();
                  } else {
                    bulk.selectAll(allIds);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
                aria-label={
                  drafts.every((d) => bulk.isSelected(d.id))
                    ? "Deselect all"
                    : "Select all"
                }
              >
                {drafts.every((d) => bulk.isSelected(d.id)) ? (
                  <CheckSquare size={16} className="text-accent" />
                ) : bulk.selectionCount > 0 ? (
                  <Minus size={16} className="text-accent" />
                ) : (
                  <Square size={16} />
                )}
              </button>
              <span className="text-xs text-text-muted">
                {bulk.selectionCount > 0
                  ? `${bulk.selectionCount} of ${drafts.length} selected`
                  : `${drafts.length} draft${drafts.length !== 1 ? "s" : ""}`}
              </span>
              {bulk.selectionCount === 0 && (
                <button
                  type="button"
                  onClick={() => bulk.selectAll(drafts.map((d) => d.id))}
                  className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  Select all
                </button>
              )}
            </div>

            <ul className="divide-y divide-border-muted">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className={`group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-surface-2 ${
                    bulk.isSelected(draft.id) ? "bg-accent/5" : ""
                  }`}
                >
                  {/* Checkbox — 44px tap target on mobile */}
                  <button
                    type="button"
                    onClick={() => bulk.toggle(draft.id)}
                    className={`-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-all hover:text-accent sm:h-auto sm:w-auto sm:p-0.5 ${
                      bulk.isSelected(draft.id) || bulk.selectionCount > 0
                        ? "opacity-100"
                        : "opacity-0 focus:opacity-100 group-hover:opacity-100 sm:opacity-0"
                    }`}
                    aria-label={
                      bulk.isSelected(draft.id)
                        ? "Deselect draft"
                        : "Select draft"
                    }
                  >
                    {bulk.isSelected(draft.id) ? (
                      <CheckSquare size={16} className="text-accent" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>

                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted">
                    <FileText size={16} className="text-accent" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {draft.threadSubject ?? "(no subject)"}
                      </span>
                      {draft.tone && TONE_COLORS[draft.tone] && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_COLORS[draft.tone]}`}
                        >
                          {draft.tone}
                        </span>
                      )}
                    </div>
                    {draft.to && (
                      <p className="mt-0.5 text-xs text-text-muted">To: {draft.to}</p>
                    )}
                    {draft.preview && (
                      <p className="mt-1 line-clamp-2 text-xs text-text-muted">
                        {draft.preview}
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] text-text-muted">
                      {formatDate(draft.createdAt)}
                    </p>
                  </div>

                  {/* Actions — always visible on mobile, opacity on desktop hover */}
                  <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEdit(draft)}
                      className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                      title="Edit draft"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={sendingId === draft.id}
                      onClick={() => handleSend(draft)}
                      className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-accent-muted hover:text-accent disabled:opacity-40"
                      title="Send draft"
                    >
                      {sendingId === draft.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={discardingId === draft.id}
                      onClick={() => setConfirmDiscard(draft)}
                      className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-40"
                      title="Discard draft"
                    >
                      {discardingId === draft.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        open={editingDraft !== null}
        onClose={() => setEditingDraft(null)}
        title="Edit Draft"
        size="lg"
      >
        <div className="space-y-4">
          {editingDraft && (
            <p className="text-sm text-text-muted">
              Re: {editingDraft.threadSubject ?? "(no subject)"}
            </p>
          )}
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-border bg-surface-0 p-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {/* Modal action buttons — stacked on mobile, row on sm+ */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setEditingDraft(null)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveEdit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save Changes
            </button>
            <button
              type="button"
              disabled={sendingId === editingDraft?.id}
              onClick={async () => {
                if (editingDraft) {
                  setEditingDraft(null);
                  await handleSend(editingDraft);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-text disabled:opacity-50 sm:ml-auto"
            >
              <Send size={14} />
              Send Now
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Discard Dialog */}
      <ConfirmDialog
        open={confirmDiscard !== null}
        onClose={() => setConfirmDiscard(null)}
        onConfirm={() => {
          if (confirmDiscard) handleDiscard(confirmDiscard);
        }}
        title="Discard Draft?"
        description={`Are you sure you want to discard this draft? "${confirmDiscard?.threadSubject ?? "Untitled"}" — this cannot be undone.`}
        confirmLabel="Discard"
        variant="danger"
      />
    </>
  );
}
