"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckSquare,
  Square,
  Minus,
  Clock,
  Plus,
  X,
  Loader2,
  ExternalLink,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useBulkSelection } from "@/hooks/useBulkSelection";

type TaskStatus = "pending" | "done" | "dismissed";
type SortField = "deadline" | "created_at";

interface Task {
  id: string;
  description: string;
  deadline: string | null;
  assignee: string | null;
  status: TaskStatus;
  sourceThreadId: string | null;
  sourceThreadSubject: string | null;
  createdAt: string;
}

type FilterTab = "all" | TaskStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "done", label: "Done" },
  { key: "dismissed", label: "Dismissed" },
];

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "";
  const d = new Date(deadline);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function TasksView() {
  const toast = useToast();
  const bulk = useBulkSelection();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [sort, setSort] = useState<SortField>("deadline");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Inline add form
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchTasks = useCallback(
    async (status: FilterTab) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (status !== "all") params.set("status", status);
        const res = await fetch(`/api/tasks?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = (await res.json()) as { tasks?: Task[]; error?: string };
        setTasks(data.tasks ?? []);
      } catch {
        toast.show("Failed to load tasks", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void fetchTasks(filter);
  }, [filter, fetchTasks]);

  async function updateStatus(id: string, status: TaskStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.show("Failed to update task", "error");
        return;
      }
      if (filter !== "all") {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status } : t)),
        );
      }
    } catch {
      toast.show("Failed to update task", "error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDesc.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: newDesc.trim(),
          deadline: newDeadline || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to add task", "error");
        return;
      }
      const created = (await res.json()) as Task;
      toast.show("Task added.", "success");
      setNewDesc("");
      setNewDeadline("");
      setShowAdd(false);
      if (filter === "all" || filter === "pending") {
        setTasks((prev) => [created, ...prev]);
      }
    } catch {
      toast.show("Failed to add task", "error");
    } finally {
      setAdding(false);
    }
  }

  async function bulkUpdateStatus(ids: string[], status: TaskStatus) {
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        toast.show(`${failed} task${failed > 1 ? "s" : ""} failed to update`, "error");
      } else {
        toast.show(
          `${ids.length} task${ids.length > 1 ? "s" : ""} marked ${status}`,
          "success",
        );
      }
      if (filter !== "all") {
        setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
      } else {
        setTasks((prev) =>
          prev.map((t) => (ids.includes(t.id) ? { ...t, status } : t)),
        );
      }
      bulk.deselectAll();
    } catch {
      toast.show("Bulk update failed", "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkDelete(ids: string[]) {
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/tasks/${id}`, { method: "DELETE" }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        toast.show(`${failed} task${failed > 1 ? "s" : ""} failed to delete`, "error");
      } else {
        toast.show(
          `${ids.length} task${ids.length > 1 ? "s" : ""} deleted`,
          "success",
        );
      }
      setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
      bulk.deselectAll();
    } catch {
      toast.show("Bulk delete failed", "error");
    } finally {
      setBulkLoading(false);
    }
  }

  const sorted = [...tasks].sort((a, b) => {
    if (sort === "deadline") {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-0 p-1">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-surface-1 text-text-primary shadow-xs"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <button
          type="button"
          onClick={() =>
            setSort((s) => (s === "deadline" ? "created_at" : "deadline"))
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <ArrowUpDown size={13} />
          Sort: {sort === "deadline" ? "Deadline" : "Created"}
        </button>

        {/* Add task */}
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
        >
          <Plus size={15} />
          Add Task
        </button>
      </div>

      {/* Inline add form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="animate-slide-up flex flex-wrap gap-2 rounded-xl border border-border bg-surface-0 p-4"
        >
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Task description..."
            autoFocus
            className="min-w-48 flex-1 rounded-lg border border-border bg-surface-1 py-2 pl-3 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <input
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 py-2 px-3 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-auto"
          />
          <button
            type="submit"
            disabled={adding || !newDesc.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Bulk actions toolbar */}
      {bulk.selectionCount > 0 && (
        <div className="animate-slide-up flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <span className="mr-1 text-sm font-medium text-text-primary">
            {bulk.selectionCount} selected
          </span>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => {
              const ids = Array.from(bulk.selectedIds);
              void bulkUpdateStatus(ids, "done");
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:min-h-0 sm:py-1.5"
          >
            {bulkLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckSquare size={14} className="text-success" />
            )}
            Complete
          </button>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => {
              const ids = Array.from(bulk.selectedIds);
              void bulkUpdateStatus(ids, "dismissed");
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50 sm:min-h-0 sm:py-1.5"
          >
            {bulkLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
            Dismiss
          </button>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => {
              const ids = Array.from(bulk.selectedIds);
              void bulkDelete(ids);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-muted px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
          >
            {bulkLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete
          </button>
          <button
            type="button"
            onClick={bulk.deselectAll}
            className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary sm:min-h-0 sm:py-1.5"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Task list */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        {/* Select-all header row */}
        {sorted.length > 0 && !loading && (
          <div className="flex items-center gap-3 border-b border-border bg-surface-0 px-4 py-2">
            <button
              type="button"
              onClick={() => {
                const allIds = sorted.map((t) => t.id);
                const allSelected = allIds.every((id) => bulk.isSelected(id));
                if (allSelected) {
                  bulk.deselectAll();
                } else {
                  bulk.selectAll(allIds);
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
              aria-label={
                sorted.every((t) => bulk.isSelected(t.id))
                  ? "Deselect all"
                  : "Select all"
              }
            >
              {sorted.length > 0 && sorted.every((t) => bulk.isSelected(t.id)) ? (
                <CheckSquare size={16} className="text-accent" />
              ) : bulk.selectionCount > 0 ? (
                <Minus size={16} className="text-accent" />
              ) : (
                <Square size={16} />
              )}
            </button>
            <span className="text-xs text-text-muted">
              {bulk.selectionCount > 0
                ? `${bulk.selectionCount} of ${sorted.length} selected`
                : `${sorted.length} task${sorted.length !== 1 ? "s" : ""}`}
            </span>
            {bulk.selectionCount === 0 && (
              <button
                type="button"
                onClick={() => bulk.selectAll(sorted.map((t) => t.id))}
                className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                Select all
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="No tasks"
            description="Tasks extracted from emails will appear here. You can also add them manually."
          />
        ) : (
          <ul className="divide-y divide-border-muted">
            {sorted.map((task) => {
              const overdue = isOverdue(task.deadline) && task.status === "pending";
              const isDone = task.status === "done";
              const isSelected = bulk.isSelected(task.id);
              return (
                <li
                  key={task.id}
                  className={`group relative flex items-start gap-3 py-3.5 pr-4 transition-colors hover:bg-surface-2 ${
                    bulk.selectionCount > 0 ? "pl-12" : "pl-4 hover:pl-12"
                  } ${isSelected ? "bg-accent/5" : ""}`}
                >
                  {/* Bulk selection checkbox — always visible on touch, hover-revealed on desktop */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      bulk.toggle(task.id);
                    }}
                    className={`absolute left-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded text-text-muted transition-all hover:text-accent sm:left-1 sm:h-8 sm:w-8 ${
                      isSelected || bulk.selectionCount > 0
                        ? "opacity-100"
                        : "opacity-0 focus:opacity-100 group-hover:opacity-100"
                    }`}
                    aria-label={isSelected ? "Deselect task" : "Select task"}
                  >
                    {isSelected ? (
                      <CheckSquare size={16} className="text-accent" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>

                  {/* Done/pending toggle — padded to reach 44px touch target on mobile */}
                  <button
                    type="button"
                    disabled={updatingId === task.id}
                    onClick={() =>
                      updateStatus(task.id, isDone ? "pending" : "done")
                    }
                    className={`mt-0.5 shrink-0 rounded-sm p-2 transition-colors ${
                      isDone
                        ? "text-success"
                        : "text-text-muted hover:text-accent"
                    } disabled:opacity-40`}
                    title={isDone ? "Mark pending" : "Mark done"}
                  >
                    {updatingId === task.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : isDone ? (
                      <CheckSquare size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm text-text-primary ${isDone ? "line-through opacity-50" : ""}`}
                    >
                      {task.description}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {task.deadline && (
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${
                            overdue
                              ? "font-medium text-danger"
                              : "text-text-muted"
                          }`}
                        >
                          <Clock size={11} />
                          {overdue ? "Overdue — " : ""}
                          {formatDeadline(task.deadline)}
                        </span>
                      )}
                      {task.assignee && (
                        <span className="text-xs text-text-muted">
                          {task.assignee}
                        </span>
                      )}
                      {task.sourceThreadId && (
                        <Link
                          href={`/thread/${task.sourceThreadId}`}
                          className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:underline"
                        >
                          <ExternalLink size={10} />
                          {task.sourceThreadSubject ?? "View thread"}
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Dismiss — always visible on mobile (touch has no hover), fades in on desktop */}
                  {task.status !== "dismissed" && (
                    <button
                      type="button"
                      disabled={updatingId === task.id}
                      onClick={() => updateStatus(task.id, "dismissed")}
                      className="mt-0.5 shrink-0 rounded-md p-2.5 text-text-muted opacity-60 transition-all hover:bg-surface-2 hover:text-text-primary group-hover:opacity-100 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Dismiss task"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
