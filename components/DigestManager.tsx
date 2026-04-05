"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Plus,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  X,
  Check,
  Clock,
  Calendar,
  Layers,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestConfig {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "never";
  schedule_time: string | null;
  schedule_day_of_week: number | null;
  include_categories: string[];
  include_tags: string[];
  include_senders: string[];
  enabled: boolean;
  last_digest_at: string | null;
  next_digest_at: string | null;
  created_at: string;
}

interface DigestEntry {
  id: string;
  digest_config_id: string;
  title: string;
  summary: string;
  thread_count: number;
  period_start: string;
  period_end: string;
  status: "pending" | "generating" | "ready" | "failed";
  generated_at: string | null;
  delivered: boolean;
  created_at: string;
}

interface ParsedSummary {
  executiveSummary: string;
  keyHighlights: Array<{ subject: string; sender: string; reason: string }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  actionItems: string[];
  threadCount: number;
  period: string;
}

interface Tag {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_CATEGORIES = [
  "work",
  "personal",
  "newsletters",
  "notifications",
  "promotions",
  "social",
  "finance",
  "travel",
  "receipts",
  "support",
  "updates",
  "spam",
];

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSummary(raw: string): ParsedSummary | null {
  try {
    return JSON.parse(raw) as ParsedSummary;
  } catch {
    return null;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${s} – ${e}`;
}

function frequencyLabel(config: DigestConfig): string {
  if (config.frequency === "never") return "Manual only";
  if (config.frequency === "daily") {
    const time = config.schedule_time ?? "08:00";
    return `Daily at ${time}`;
  }
  if (config.frequency === "weekly") {
    const day = DAYS_OF_WEEK[config.schedule_day_of_week ?? 1] ?? "Monday";
    const time = config.schedule_time ?? "08:00";
    return `Weekly on ${day} at ${time}`;
  }
  return config.frequency;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DigestEntry["status"] }) {
  const map: Record<DigestEntry["status"], { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-surface-2 text-text-muted" },
    generating: { label: "Generating…", className: "bg-accent-muted text-accent" },
    ready: { label: "Ready", className: "bg-success-muted text-success" },
    failed: { label: "Failed", className: "bg-danger-muted text-danger" },
  };
  const { label, className } = map[status] ?? map.pending;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Digest entry card
// ---------------------------------------------------------------------------

function DigestEntryCard({ entry }: { entry: DigestEntry }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = entry.status === "ready" ? parseSummary(entry.summary) : null;

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status={entry.status} />
            <span className="text-xs text-text-muted">
              {formatDateRange(entry.period_start, entry.period_end)}
            </span>
            <span className="text-xs text-text-muted">
              {entry.thread_count} thread{entry.thread_count !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{entry.title}</p>
          {entry.generated_at && (
            <p className="text-xs text-text-muted mt-0.5">
              Generated {formatDateTime(entry.generated_at)}
            </p>
          )}
        </div>
        <span className="shrink-0 text-text-muted mt-0.5">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && parsed && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Executive summary */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
              Executive Summary
            </h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              {parsed.executiveSummary}
            </p>
          </div>

          {/* Key highlights */}
          {parsed.keyHighlights.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                Key Highlights
              </h4>
              <ul className="space-y-2">
                {parsed.keyHighlights.map((h, i) => (
                  <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-sm font-medium text-text-primary">{h.subject}</p>
                    <p className="text-xs text-text-muted">{h.sender}</p>
                    {h.reason && (
                      <p className="text-xs text-text-secondary mt-0.5">{h.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action items */}
          {parsed.actionItems.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                Action Items
              </h4>
              <ul className="space-y-1">
                {parsed.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Check size={14} className="mt-0.5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Category breakdown */}
          {parsed.categoryBreakdown.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                Category Breakdown
              </h4>
              <div className="flex flex-wrap gap-2">
                {parsed.categoryBreakdown.map((c, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-border bg-surface-0 px-2.5 py-0.5 text-xs text-text-secondary"
                  >
                    {c.category}: {c.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {expanded && entry.status === "failed" && (
        <div className="border-t border-border px-4 pb-4 pt-3 flex items-start gap-2 text-sm text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{entry.summary || "Generation failed. Please try again."}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Digest config card
// ---------------------------------------------------------------------------

interface DigestConfigCardProps {
  config: DigestConfig;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (config: DigestConfig) => void;
  onGenerate: (id: string) => Promise<void>;
}

function DigestConfigCard({
  config,
  onToggle,
  onDelete,
  onEdit,
  onGenerate,
}: DigestConfigCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<DigestEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && entries.length === 0) {
      setLoadingEntries(true);
      try {
        const res = await fetch(
          `/api/digests/entries?configId=${config.id}&limit=5`,
        );
        if (res.ok) {
          const data = (await res.json()) as { entries: DigestEntry[] };
          setEntries(data.entries ?? []);
        }
      } finally {
        setLoadingEntries(false);
      }
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await onGenerate(config.id);
      // Reload entries after generation
      const res = await fetch(`/api/digests/entries?configId=${config.id}&limit=5`);
      if (res.ok) {
        const data = (await res.json()) as { entries: DigestEntry[] };
        setEntries(data.entries ?? []);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(config.id, !config.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted">
          <BookOpen size={16} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{config.name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock size={11} />
              {frequencyLabel(config)}
            </span>
            {config.next_digest_at && config.enabled && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Calendar size={11} />
                Next: {formatDateTime(config.next_digest_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            title="Generate now"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
          >
            {generating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onEdit(config)}
            title="Edit"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            title={config.enabled ? "Disable" : "Enable"}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
          >
            {config.enabled ? (
              <ToggleRight size={15} className="text-accent" />
            ) : (
              <ToggleLeft size={15} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(config.id)}
            title="Delete"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={handleExpand}
            title={expanded ? "Collapse" : "Expand"}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Tags / categories chips */}
      {(config.include_categories.length > 0 || config.include_tags.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {config.include_categories.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-surface-0 px-2 py-0.5 text-[10px] capitalize text-text-secondary"
            >
              {c}
            </span>
          ))}
          {config.include_tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-accent/30 bg-accent-muted px-2 py-0.5 text-[10px] text-accent"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Entries */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
            Recent Digests
          </p>
          {loadingEntries ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No digests generated yet. Click the refresh icon to generate one now.
            </p>
          ) : (
            entries.map((entry) => <DigestEntryCard key={entry.id} entry={entry} />)
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config form modal
// ---------------------------------------------------------------------------

interface ConfigFormProps {
  initial: Partial<DigestConfig> | null;
  tags: Tag[];
  onSave: (data: Partial<DigestConfig>) => Promise<void>;
  onClose: () => void;
}

function ConfigForm({ initial, tags, onSave, onClose }: ConfigFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "never">(
    initial?.frequency ?? "daily",
  );
  const [scheduleTime, setScheduleTime] = useState(initial?.schedule_time ?? "08:00");
  const [dayOfWeek, setDayOfWeek] = useState<number>(initial?.schedule_day_of_week ?? 1);
  const [categories, setCategories] = useState<string[]>(initial?.include_categories ?? []);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.include_tags ?? []);
  const [senderInput, setSenderInput] = useState(
    (initial?.include_senders ?? []).join(", "),
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const senders = senderInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await onSave({
        name: name.trim(),
        frequency,
        schedule_time: scheduleTime,
        schedule_day_of_week: frequency === "weekly" ? dayOfWeek : null,
        include_categories: categories,
        include_tags: selectedTags,
        include_senders: senders,
        enabled,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-0 shadow-xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">
            {initial?.id ? "Edit Digest" : "New Digest"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-primary">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work Emails, Newsletter Roundup"
              required
              className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-primary">
              Frequency
            </label>
            <div className="flex gap-2">
              {(["daily", "weekly", "never"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                    frequency === f
                      ? "border-accent bg-accent-muted text-accent"
                      : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule time */}
          {frequency !== "never" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-text-primary">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              {frequency === "weekly" && (
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-text-primary">
                    Day of Week
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {DAYS_OF_WEEK.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Categories */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-primary">
              Include Categories
              <span className="ml-1 font-normal text-text-muted">(leave empty for all)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AI_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${
                    categories.includes(cat)
                      ? "border-accent bg-accent-muted text-accent"
                      : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-primary">
                Include Tags
                <span className="ml-1 font-normal text-text-muted">(leave empty for all)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.name)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      selectedTags.includes(tag.name)
                        ? "border-accent bg-accent-muted text-accent"
                        : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    #{tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Senders */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-primary">
              Filter by Senders
              <span className="ml-1 font-normal text-text-muted">
                (comma-separated emails, leave empty for all)
              </span>
            </label>
            <input
              type="text"
              value={senderInput}
              onChange={(e) => setSenderInput(e.target.value)}
              placeholder="alice@example.com, bob@company.com"
              className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2.5">
            <span className="text-sm text-text-primary">Enable this digest</span>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className="text-text-muted transition-colors hover:text-text-primary"
            >
              {enabled ? (
                <ToggleRight size={22} className="text-accent" />
              ) : (
                <ToggleLeft size={22} />
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {initial?.id ? "Save Changes" : "Create Digest"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DigestManager() {
  const toast = useToast();
  const [configs, setConfigs] = useState<DigestConfig[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState<Partial<DigestConfig> | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/digests");
      if (!res.ok) {
        toast.show("Failed to load digest configs", "error");
        return;
      }
      const data = (await res.json()) as { configs: DigestConfig[] };
      setConfigs(data.configs ?? []);
    } catch {
      toast.show("Failed to load digest configs", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = (await res.json()) as { tags: Tag[] };
        setTags(data.tags ?? []);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    void fetchConfigs();
    void fetchTags();
  }, [fetchConfigs, fetchTags]);

  async function handleSave(data: Partial<DigestConfig>) {
    const isEdit = Boolean(modalConfig?.id);
    const url = isEdit ? `/api/digests/${modalConfig!.id}` : "/api/digests";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.show(j.error ?? "Failed to save digest config", "error");
      return;
    }

    toast.show(isEdit ? "Digest updated." : "Digest created.", "success");
    setShowModal(false);
    setModalConfig(null);
    await fetchConfigs();
  }

  async function handleToggle(id: string, enabled: boolean) {
    const res = await fetch(`/api/digests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.show("Failed to update digest", "error");
      return;
    }
    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled } : c)),
    );
    toast.show(enabled ? "Digest enabled." : "Digest disabled.", "success");
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/digests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.show("Failed to delete digest", "error");
      return;
    }
    setConfigs((prev) => prev.filter((c) => c.id !== id));
    toast.show("Digest deleted.", "success");
  }

  async function handleGenerate(id: string) {
    const res = await fetch(`/api/digests/${id}/generate`, { method: "POST" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.show(j.error ?? "Failed to generate digest", "error");
      return;
    }
    toast.show("Digest generated.", "success");
    // Refresh configs so next_digest_at / last_digest_at update
    await fetchConfigs();
  }

  function openCreate() {
    setModalConfig({});
    setShowModal(true);
  }

  function openEdit(config: DigestConfig) {
    setModalConfig(config);
    setShowModal(true);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <Layers size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Email Digests</h2>
            <p className="text-xs text-text-muted">
              AI-summarized email roundups on your schedule
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
        >
          <Plus size={15} />
          New Digest
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : configs.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No digest configs yet"
          description="Create a digest to receive AI-summarized email roundups on a schedule."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Plus size={15} />
              Create your first digest
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <DigestConfigCard
              key={config.id}
              config={config}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={openEdit}
              onGenerate={handleGenerate}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ConfigForm
          initial={modalConfig}
          tags={tags}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setModalConfig(null);
          }}
        />
      )}
    </div>
  );
}
