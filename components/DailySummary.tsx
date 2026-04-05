"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Loader2,
  Mail,
  Clock,
  Calendar,
  Activity,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

// Shape of the `content` JSONB column, produced by lib/ai/daily-summary.ts
interface SummaryContent {
  narrative: string;
  urgentThreadCount: number;
  awaitingReplyCount: number;
  pendingTaskCount: number;
  overdueTaskCount: number;
  todayEventCount: number;
  autoArchivedCount: number;
  pendingApprovalCount: number;
  generatedAt: string;
}

// Shape of the DB row returned by /api/summaries/latest
interface SummaryRow {
  id: string;
  summary_date: string;
  content: SummaryContent;
  generated_at: string;
}

// Envelope returned by /api/summaries/latest
interface LatestSummaryResponse {
  summary: SummaryRow | null;
}


function formatDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  highlight,
}: {
  label: string;
  value: number;
  icon: typeof Mail;
  iconColor: string;
  iconBg: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 ${
        highlight && value > 0
          ? "border-warning bg-warning-muted/30"
          : "border-border bg-surface-1"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
      >
        <Icon size={16} className={iconColor} />
      </div>
      <div>
        <p className="text-xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

export function DailySummary() {
  const toast = useToast();
  const [summaryRow, setSummaryRow] = useState<SummaryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    formatDateInput(new Date()),
  );

  const fetchSummary = useCallback(
    async (date: string) => {
      setLoading(true);
      setSummaryRow(null);
      try {
        const params = new URLSearchParams({ date });
        const res = await fetch(`/api/summaries/latest?${params.toString()}`);
        if (!res.ok) {
          if (res.status !== 401) {
            toast.show("Failed to load summary", "error");
          }
          return;
        }
        const data = (await res.json()) as LatestSummaryResponse;
        setSummaryRow(data.summary ?? null);
      } catch {
        toast.show("Failed to load summary", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void fetchSummary(selectedDate);
  }, [selectedDate, fetchSummary]);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/ai/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to generate summary", "error");
        return;
      }
      // The generate endpoint returns { summary: SummaryContent }, not a full row.
      // Refetch so we get the persisted row with id and summary_date.
      await fetchSummary(selectedDate);
      toast.show("Summary regenerated.", "success");
    } catch {
      toast.show("Failed to generate summary", "error");
    } finally {
      setRegenerating(false);
    }
  }

  function shiftDate(days: number) {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDateInput(d));
  }

  const today = formatDateInput(new Date());
  const isToday = selectedDate === today;
  const content = summaryRow?.content ?? null;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date navigation */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-0 p-1">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Previous day"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            disabled={isToday}
            aria-label="Next day"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {regenerating ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          {regenerating ? "Generating..." : "Regenerate"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface-1 p-5"
            >
              <Skeleton className="mb-4 h-5 w-40 rounded" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-3/4 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : !content ? (
        <EmptyState
          icon={FileText}
          title="No summary generated yet"
          description="Click Regenerate to create one."
          action={
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {regenerating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
              Generate Summary
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Urgent Threads"
              value={content.urgentThreadCount}
              icon={AlertTriangle}
              iconColor="text-danger"
              iconBg="bg-danger-muted"
              highlight
            />
            <StatCard
              label="Awaiting Reply"
              value={content.awaitingReplyCount}
              icon={MessageSquare}
              iconColor="text-accent"
              iconBg="bg-accent-muted"
            />
            <StatCard
              label="Pending Tasks"
              value={content.pendingTaskCount}
              icon={CheckSquare}
              iconColor="text-warning"
              iconBg="bg-warning-muted"
              highlight
            />
            <StatCard
              label="Today's Events"
              value={content.todayEventCount}
              icon={Calendar}
              iconColor="text-success"
              iconBg="bg-success-muted"
            />
          </div>

          {/* Secondary stats — last item spans 2 cols on mobile so it is centred when count is odd */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
            <StatCard
              label="Auto-Archived"
              value={content.autoArchivedCount}
              icon={Activity}
              iconColor="text-text-muted"
              iconBg="bg-surface-2"
            />
            <StatCard
              label="Overdue Tasks"
              value={content.overdueTaskCount}
              icon={Clock}
              iconColor="text-danger"
              iconBg="bg-danger-muted"
              highlight
            />
            <StatCard
              label="Pending Approvals"
              value={content.pendingApprovalCount}
              icon={Mail}
              iconColor="text-warning"
              iconBg="bg-warning-muted"
              highlight
            />
          </div>

          {/* AI Narrative */}
          {content.narrative && (
            <section className="rounded-xl border border-border bg-surface-1 shadow-xs">
              <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted">
                  <FileText size={14} className="text-accent" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Executive Briefing
                </h3>
              </div>
              <div className="p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {content.narrative}
                </p>
              </div>
            </section>
          )}

          {/* Generated timestamp */}
          <p className="text-center text-xs text-text-muted">
            Generated{" "}
            {new Date(content.generatedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
