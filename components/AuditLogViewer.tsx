"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  RotateCcw,
  Loader2,
  Filter,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

interface AuditEntry {
  id: string;
  actor: "user" | "system" | "rule";
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  reversible: boolean;
  undone_at: string | null;
  created_at: string;
}

interface ApiResponse {
  entries?: AuditEntry[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

const ACTOR_OPTIONS = ["all", "user", "system", "rule"] as const;
const PAGE_SIZE = 50;

function ActorBadge({ actor }: { actor: AuditEntry["actor"] }) {
  const styles: Record<AuditEntry["actor"], string> = {
    user: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    system: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    rule: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[actor]}`}
    >
      {actor}
    </span>
  );
}

function DetailsCell({ details }: { details: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Object.keys(details).length > 0;

  if (!hasDetails) {
    return <span className="text-text-muted text-xs">—</span>;
  }

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
        {open ? "Hide" : "Show"}
      </button>
      {open && (
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-md bg-surface-2 p-2 text-xs text-text-secondary dark:bg-surface-0">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [filterActor, setFilterActor] = useState<string>("all");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const toast = useToast();

  const fetch_ = useCallback(
    async (pageIndex: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(pageIndex * PAGE_SIZE));
        if (filterActor !== "all") params.set("actor", filterActor);
        if (filterAction.trim()) params.set("action", filterAction.trim());
        if (filterFrom) params.set("from", new Date(filterFrom).toISOString());
        if (filterTo) {
          const d = new Date(filterTo);
          d.setHours(23, 59, 59, 999);
          params.set("to", d.toISOString());
        }

        const res = await fetch(`/api/audit-log?${params.toString()}`);
        const json = (await res.json()) as ApiResponse;
        if (!res.ok) {
          toast.show(json.error ?? "Failed to load audit log", "error");
          return;
        }
        setEntries(json.entries ?? []);
        setTotal(json.total ?? 0);
      } catch {
        toast.show("Failed to load audit log", "error");
      } finally {
        setLoading(false);
      }
    },
    [filterActor, filterAction, filterFrom, filterTo, toast],
  );

  useEffect(() => {
    setPage(0);
    void fetch_(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActor, filterAction, filterFrom, filterTo]);

  useEffect(() => {
    void fetch_(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleUndo(entryId: string) {
    setUndoingId(entryId);
    try {
      const res = await fetch(`/api/audit-log/${entryId}/undo`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.show(json.error ?? "Undo failed", "error");
        return;
      }
      toast.show("Action undone successfully", "success");
      void fetch_(page);
    } catch {
      toast.show("Undo failed", "error");
    } finally {
      setUndoingId(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2 p-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-text-muted" />
          <span className="text-xs font-medium text-text-secondary">Filters</span>
        </div>

        {/* Filter inputs — full-width on mobile, auto on sm+ */}
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs text-text-muted">Actor</label>
          <select
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto sm:py-1.5"
            value={filterActor}
            onChange={(e) => setFilterActor(e.target.value)}
          >
            {ACTOR_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All actors" : a.charAt(0).toUpperCase() + a.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs text-text-muted">Action</label>
          <input
            type="search"
            inputMode="search"
            placeholder="e.g. thread.archive"
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto sm:py-1.5"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs text-text-muted">From</label>
          <input
            type="date"
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto sm:py-1.5"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs text-text-muted">To</label>
          <input
            type="date"
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto sm:py-1.5"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </div>

        {(filterActor !== "all" || filterAction || filterFrom || filterTo) && (
          <button
            type="button"
            className="self-end rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-surface-1 hover:text-text-secondary"
            onClick={() => {
              setFilterActor("all");
              setFilterAction("");
              setFilterFrom("");
              setFilterTo("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-text-muted" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No activity yet"
          description="Actions you and the system take will appear here."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Details</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Undo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`transition-colors hover:bg-surface-2 ${entry.undone_at ? "opacity-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                      {formatTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <ActorBadge actor={entry.actor} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-primary">{entry.action}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-text-secondary capitalize">
                        {entry.target_type.replace(".", " ")}
                      </span>
                      {entry.target_id && (
                        <span className="ml-1 font-mono text-xs text-text-muted">
                          {entry.target_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DetailsCell details={entry.details} />
                    </td>
                    <td className="px-4 py-3">
                      {entry.reversible && !entry.undone_at ? (
                        <button
                          type="button"
                          disabled={undoingId === entry.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                          onClick={() => handleUndo(entry.id)}
                        >
                          {undoingId === entry.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <RotateCcw size={11} />
                          )}
                          Undo
                        </button>
                      ) : entry.undone_at ? (
                        <span className="text-xs text-text-muted italic">Undone</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-40"
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={13} />
                  Previous
                </button>
                <span className="text-xs text-text-muted">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-40"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
