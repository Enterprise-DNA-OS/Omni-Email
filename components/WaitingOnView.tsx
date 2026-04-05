"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Send,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Square,
  CheckSquare,
  Minus,
  CheckCheck,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { useBulkSelection } from "@/hooks/useBulkSelection";

// ---- Types -----------------------------------------------------------------

type FollowUp = {
  id: string;
  threadId: string;
  subject: string | null;
  recipient: string | null;
  sentAt: string;
  daysWaiting: number;
};

type GroupedFollowUps = {
  overdue: FollowUp[];
  dueSoon: FollowUp[];
  waiting: FollowUp[];
};

// ---- Helpers ---------------------------------------------------------------

function recipientName(raw: string | null): string {
  if (!raw) return "Unknown";
  const match = raw.match(/^(.*?)\s*<[^>]+>\s*$/);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") || raw : raw;
}

function daysBadge(days: number): {
  label: string;
  className: string;
} {
  if (days >= 7) {
    return {
      label: `${days}d overdue`,
      className:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
  }
  if (days >= 3) {
    return {
      label: `${days}d waiting`,
      className:
        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    };
  }
  return {
    label: `${days}d waiting`,
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
}

function groupFollowUps(items: FollowUp[]): GroupedFollowUps {
  const overdue: FollowUp[] = [];
  const dueSoon: FollowUp[] = [];
  const waiting: FollowUp[] = [];

  for (const item of items) {
    if (item.daysWaiting >= 7) overdue.push(item);
    else if (item.daysWaiting >= 3) dueSoon.push(item);
    else waiting.push(item);
  }

  return { overdue, dueSoon, waiting };
}

// ---- Row -------------------------------------------------------------------

function FollowUpRow({
  item,
  onFollowUp,
  onCancel,
  isSelected,
  onToggleSelect,
  selectionActive,
}: {
  item: FollowUp;
  onFollowUp: (item: FollowUp) => void;
  onCancel: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  selectionActive: boolean;
}) {
  const badge = daysBadge(item.daysWaiting);

  return (
    <div
      className={`rounded-xl border border-border bg-surface-1 px-4 py-3 shadow-xs transition-shadow hover:shadow-sm ${
        isSelected ? "ring-2 ring-accent/40 bg-accent/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox — always rendered; visible when selection is active,
            otherwise shown on hover/focus only */}
        <button
          type="button"
          onClick={() => onToggleSelect(item.id)}
          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-all hover:text-accent sm:h-5 sm:w-5 ${
            isSelected || selectionActive
              ? "opacity-100"
              : "opacity-0 focus:opacity-100 group-hover:opacity-100"
          }`}
          aria-label={isSelected ? "Deselect" : "Select"}
        >
          {isSelected ? (
            <CheckSquare size={16} className="text-accent" />
          ) : (
            <Square size={16} />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/thread/${item.threadId}`}
            className="block truncate text-sm font-semibold text-text-primary hover:text-accent"
          >
            {item.subject ?? "(no subject)"}
          </Link>
          <p className="mt-0.5 text-xs text-text-muted">
            Waiting on {recipientName(item.recipient)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      {/* Action buttons — full-width stack on mobile, inline on sm+ */}
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => onFollowUp(item)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover sm:w-auto sm:py-1.5"
          title="Send follow-up"
        >
          <Send size={11} />
          Follow Up
        </button>
        <button
          type="button"
          onClick={() => onCancel(item.id)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 sm:w-auto sm:py-1.5"
          title="Stop tracking"
        >
          <X size={11} />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Group Section ---------------------------------------------------------

function GroupSection({
  title,
  icon: Icon,
  iconClass,
  items,
  onFollowUp,
  onCancel,
  bulk,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  items: FollowUp[];
  onFollowUp: (item: FollowUp) => void;
  onCancel: (id: string) => void;
  bulk: {
    isSelected: (id: string) => boolean;
    toggle: (id: string) => void;
    selectionCount: number;
  };
}) {
  if (items.length === 0) return null;

  return (
    <section className="group">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        <Icon size={13} className={iconClass} />
        {title}
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
          {items.length}
        </span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <FollowUpRow
            key={item.id}
            item={item}
            onFollowUp={onFollowUp}
            onCancel={onCancel}
            isSelected={bulk.isSelected(item.id)}
            onToggleSelect={bulk.toggle}
            selectionActive={bulk.selectionCount > 0}
          />
        ))}
      </div>
    </section>
  );
}

// ---- Bulk Toolbar ----------------------------------------------------------

function WaitingBulkToolbar({
  selectedCount,
  totalCount,
  onMarkDone,
  onCancelSelected,
  onDeselectAll,
  isBusy,
}: {
  selectedCount: number;
  totalCount: number;
  onMarkDone: () => void;
  onCancelSelected: () => void;
  onDeselectAll: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 shadow-xs">
      {/* Selection count */}
      <span className="text-sm font-medium text-text-primary">
        {selectedCount} of {totalCount} selected
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* Mark Done */}
        <button
          type="button"
          disabled={isBusy}
          onClick={onMarkDone}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50 sm:py-1.5"
        >
          {isBusy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCheck size={12} />
          )}
          Mark Done
        </button>

        {/* Cancel selected */}
        <button
          type="button"
          disabled={isBusy}
          onClick={onCancelSelected}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50 sm:py-1.5"
        >
          <X size={12} />
          Cancel
        </button>

        {/* Deselect */}
        <button
          type="button"
          disabled={isBusy}
          onClick={onDeselectAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 disabled:opacity-50 sm:py-1.5"
          aria-label="Deselect all"
        >
          <Minus size={12} />
          Deselect
        </button>
      </div>
    </div>
  );
}

// ---- Loading Skeleton -------------------------------------------------------

function WaitingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 rounded" />
            <Skeleton className="h-3 w-2/5 rounded" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-lg" />
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ---- Main ------------------------------------------------------------------

export function WaitingOnView() {
  const toast = useToast();
  const bulk = useBulkSelection();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/follow-ups");
      if (!res.ok) throw new Error("Failed to load follow-ups");
      const json = (await res.json()) as { followUps?: FollowUp[] };
      setFollowUps(json.followUps ?? []);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : "Failed to load follow-ups",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchFollowUps();
  }, [fetchFollowUps]);

  const handleFollowUp = useCallback(
    async (item: FollowUp) => {
      setSendingId(item.id);
      try {
        const res = await fetch(`/api/follow-ups/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "followed_up" }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Failed to send follow-up");
        }
        toast.show("Follow-up sent!", "success");
        setFollowUps((prev) => prev.filter((f) => f.id !== item.id));
      } catch (e) {
        toast.show(
          e instanceof Error ? e.message : "Failed to send follow-up",
          "error",
        );
      } finally {
        setSendingId(null);
      }
    },
    [toast],
  );

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/follow-ups/${id}`, { method: "DELETE" });
        setFollowUps((prev) => prev.filter((f) => f.id !== id));
        toast.show("Follow-up cancelled.", "info");
      } catch {
        toast.show("Failed to cancel.", "error");
      }
    },
    [toast],
  );

  // Bulk: mark selected items as replied (done)
  const handleBulkMarkDone = useCallback(async () => {
    setBulkBusy(true);
    const ids = Array.from(bulk.selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/follow-ups/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "replied" }),
        }),
      ),
    );
    const succeeded = ids.filter((_, i) => results[i].status === "fulfilled");
    const failCount = ids.length - succeeded.length;

    setFollowUps((prev) => prev.filter((f) => !succeeded.includes(f.id)));
    bulk.deselectAll();

    if (failCount > 0) {
      toast.show(
        `${succeeded.length} marked done, ${failCount} failed.`,
        "error",
      );
    } else {
      toast.show(
        `${succeeded.length} follow-up${succeeded.length !== 1 ? "s" : ""} marked done.`,
        "success",
      );
    }
    setBulkBusy(false);
  }, [bulk, toast]);

  // Bulk: cancel (delete) selected items
  const handleBulkCancel = useCallback(async () => {
    setBulkBusy(true);
    const ids = Array.from(bulk.selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/follow-ups/${id}`, { method: "DELETE" }),
      ),
    );
    const succeeded = ids.filter((_, i) => results[i].status === "fulfilled");
    const failCount = ids.length - succeeded.length;

    setFollowUps((prev) => prev.filter((f) => !succeeded.includes(f.id)));
    bulk.deselectAll();

    if (failCount > 0) {
      toast.show(
        `${succeeded.length} cancelled, ${failCount} failed.`,
        "error",
      );
    } else {
      toast.show(
        `${succeeded.length} follow-up${succeeded.length !== 1 ? "s" : ""} cancelled.`,
        "info",
      );
    }
    setBulkBusy(false);
  }, [bulk, toast]);

  if (loading) return <WaitingSkeleton />;

  if (followUps.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing waiting"
        description="You have no pending follow-ups. When you send emails that need replies, they'll be tracked here."
      />
    );
  }

  const groups = groupFollowUps(followUps);
  const allIds = followUps.map((f) => f.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => bulk.isSelected(id));

  // Wrap single-item follow-up so it guards against concurrent sends
  const wrappedFollowUp = (item: FollowUp) => {
    if (sendingId !== null) return;
    void handleFollowUp(item);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {groups.overdue.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle size={12} />
            {groups.overdue.length} overdue (&ge;7d)
          </span>
        )}
        {groups.dueSoon.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
            <Clock size={12} />
            {groups.dueSoon.length} due soon (3-6d)
          </span>
        )}
        {groups.waiting.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock size={12} />
            {groups.waiting.length} waiting (&lt;3d)
          </span>
        )}
      </div>

      {/* Select All header row */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-2 shadow-xs">
        <button
          type="button"
          onClick={() => {
            if (allSelected) {
              bulk.deselectAll();
            } else {
              bulk.selectAll(allIds);
            }
          }}
          className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
          aria-label={allSelected ? "Deselect all" : "Select all"}
        >
          {allSelected ? (
            <CheckSquare size={16} className="text-accent" />
          ) : bulk.selectionCount > 0 ? (
            <Minus size={16} className="text-accent" />
          ) : (
            <Square size={16} />
          )}
        </button>
        <span className="text-xs text-text-muted">
          {bulk.selectionCount > 0
            ? `${bulk.selectionCount} of ${followUps.length} selected`
            : `${followUps.length} follow-up${followUps.length !== 1 ? "s" : ""}`}
        </span>
        {bulk.selectionCount === 0 && (
          <button
            type="button"
            onClick={() => bulk.selectAll(allIds)}
            className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Select all
          </button>
        )}
      </div>

      {/* Bulk actions toolbar — shown when at least one item is selected */}
      {bulk.selectionCount > 0 && (
        <WaitingBulkToolbar
          selectedCount={bulk.selectionCount}
          totalCount={followUps.length}
          onMarkDone={handleBulkMarkDone}
          onCancelSelected={handleBulkCancel}
          onDeselectAll={bulk.deselectAll}
          isBusy={bulkBusy}
        />
      )}

      <GroupSection
        title="Overdue"
        icon={AlertTriangle}
        iconClass="text-red-500"
        items={groups.overdue}
        onFollowUp={wrappedFollowUp}
        onCancel={handleCancel}
        bulk={bulk}
      />
      <GroupSection
        title="Due Soon"
        icon={Clock}
        iconClass="text-orange-500"
        items={groups.dueSoon}
        onFollowUp={wrappedFollowUp}
        onCancel={handleCancel}
        bulk={bulk}
      />
      <GroupSection
        title="Waiting"
        icon={Clock}
        iconClass="text-yellow-500"
        items={groups.waiting}
        onFollowUp={wrappedFollowUp}
        onCancel={handleCancel}
        bulk={bulk}
      />

      {sendingId && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-lg bg-surface-1 px-4 py-3 shadow-lg border border-border text-sm text-text-primary">
          <Loader2 size={14} className="animate-spin text-accent" />
          Sending follow-up...
        </div>
      )}
    </div>
  );
}
