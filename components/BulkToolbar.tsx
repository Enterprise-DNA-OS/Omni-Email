"use client";

import { useState } from "react";
import {
  Archive,
  Trash2,
  Tag,
  MailOpen,
  Mail,
  X,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/Toast";

interface BulkToolbarProps {
  selectedIds: Set<string>;
  onDeselectAll: () => void;
  tags?: { id: string; name: string }[];
  onActionComplete?: () => void;
}

type BulkAction = "archive" | "delete" | "mark_read" | "mark_unread" | "add_tag";

export function BulkToolbar({
  selectedIds,
  onDeselectAll,
  tags = [],
  onActionComplete,
}: BulkToolbarProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);

  const count = selectedIds.size;

  if (count === 0) return null;

  async function runBulkAction(
    action: BulkAction,
    params?: Record<string, string>,
  ) {
    setBusy(action);
    try {
      const res = await fetch("/api/threads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadIds: Array.from(selectedIds),
          action,
          params: params ?? {},
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Action failed", "error");
        return;
      }
      const result = (await res.json().catch(() => ({}))) as {
        processed?: number;
        errors?: string[];
      };
      const labels: Record<BulkAction, string> = {
        archive: "Archived",
        delete: "Deleted",
        mark_read: "Marked as read",
        mark_unread: "Marked as unread",
        add_tag: "Tag applied",
      };
      const processedCount = result.processed ?? count;
      const errorCount = result.errors?.length ?? 0;
      if (errorCount > 0 && processedCount === 0) {
        toast.show(`Action failed for all ${count} threads.`, "error");
      } else if (errorCount > 0) {
        toast.show(
          `${labels[action]} ${processedCount} thread${processedCount !== 1 ? "s" : ""}. ${errorCount} failed.`,
          "error",
        );
      } else {
        toast.show(
          `${labels[action]} ${processedCount} thread${processedCount !== 1 ? "s" : ""}.`,
          "success",
        );
      }
      onDeselectAll();
      onActionComplete?.();
    } catch {
      toast.show("Action failed", "error");
    } finally {
      setBusy(null);
      setTagMenuOpen(false);
    }
  }

  return (
    /* On mobile: count + Deselect stay on one line; actions wrap below.
       On sm+: everything fits in a single flex row.
       flex-wrap + w-full on the actions group ensures deselect doesn't float
       away from the action buttons when they wrap to a second line. */
    <div className="animate-slide-up rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 shadow-xs sm:px-4 sm:py-2.5">
      {/* Top row: count badge + deselect (always visible together) */}
      <div className="flex items-center justify-between">
        <span className="shrink-0 text-sm font-medium text-text-primary">
          {count} selected
        </span>
        {/* Deselect — anchored next to count on mobile so it's always reachable */}
        <button
          type="button"
          onClick={onDeselectAll}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary sm:py-1.5"
        >
          <X size={13} />
          <span className="hidden sm:inline">Deselect all</span>
        </button>
      </div>

      {/* Actions row: icon-only on mobile (<sm), icon+label on sm+.
          py-2.5 on mobile gives ~44px touch target height. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-0">
        <button
          type="button"
          title="Archive selected"
          disabled={busy !== null}
          onClick={() => runBulkAction("archive")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:py-1.5"
        >
          {busy === "archive" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Archive size={13} />
          )}
          <span className="hidden sm:inline">Archive</span>
        </button>

        <button
          type="button"
          title="Delete selected"
          disabled={busy !== null}
          onClick={() => runBulkAction("delete")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger/20 px-2.5 py-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger-muted disabled:opacity-50 sm:py-1.5"
        >
          {busy === "delete" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Trash2 size={13} />
          )}
          <span className="hidden sm:inline">Delete</span>
        </button>

        {/* Add Tag dropdown */}
        <div className="relative">
          <button
            type="button"
            title="Add tag"
            disabled={busy !== null || tags.length === 0}
            onClick={() => setTagMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:py-1.5"
          >
            {busy === "add_tag" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Tag size={13} />
            )}
            <span className="hidden sm:inline">Add Tag</span>
            <ChevronDown size={11} className="hidden sm:inline" />
          </button>

          {tagMenuOpen && tags.length > 0 && (
            /* min-w-44 and right-0 prevents the dropdown overflowing the right edge
               of the screen on small phones */
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-border bg-surface-1 shadow-md">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => runBulkAction("add_tag", { tagId: t.id })}
                  /* py-3 gives a comfortable touch target in the dropdown */
                  className="flex w-full items-center gap-2 px-3 py-3 text-left text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary sm:py-2"
                >
                  <Tag size={11} className="text-accent" />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          title="Mark as read"
          disabled={busy !== null}
          onClick={() => runBulkAction("mark_read")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:py-1.5"
        >
          {busy === "mark_read" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <MailOpen size={13} />
          )}
          <span className="hidden sm:inline">Mark Read</span>
        </button>

        <button
          type="button"
          title="Mark as unread"
          disabled={busy !== null}
          onClick={() => runBulkAction("mark_unread")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:py-1.5"
        >
          {busy === "mark_unread" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Mail size={13} />
          )}
          <span className="hidden sm:inline">Mark Unread</span>
        </button>
      </div>
    </div>
  );
}
