"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldOff,
  ToggleLeft,
  ToggleRight,
  Archive,
  Tag,
  List,
  XCircle,
  Ban,
  FlaskConical,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Info,
  Square,
  CheckSquare,
  Minus,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { useBulkSelection } from "@/hooks/useBulkSelection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColdEmailSettings {
  enabled: boolean;
  mode: "list" | "label" | "archive";
  customCriteria: string | null;
}

interface ColdEmailThread {
  subject: string;
  snippet: string;
}

interface ColdEmailEntry {
  id: string;
  threadId: string;
  senderEmail: string;
  senderDomain: string | null;
  confidence: number;
  reasoning: string | null;
  actionTaken: "none" | "labeled" | "archived" | "reported";
  isFalsePositive: boolean;
  detectedAt: string;
  thread: ColdEmailThread;
}

interface ListResponse {
  coldEmails: ColdEmailEntry[];
  total: number;
  page: number;
  limit: number;
}

interface TestResult {
  threadId: string;
  senderEmail: string;
  senderHistory: number;
  isColdEmail: boolean;
  confidence: number;
  reasoning: string;
  signals: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "text-red-600 dark:text-red-400";
  if (confidence >= 0.6) return "text-amber-600 dark:text-amber-400";
  return "text-yellow-600 dark:text-yellow-400";
}

function confidenceBg(confidence: number): string {
  if (confidence >= 0.8) return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
  if (confidence >= 0.6)
    return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
  return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
}

function actionBadge(action: ColdEmailEntry["actionTaken"]): React.ReactNode {
  switch (action) {
    case "labeled":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          <Tag size={10} />
          Labeled
        </span>
      );
    case "archived":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
          <Archive size={10} />
          Archived
        </span>
      );
    case "reported":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
          <AlertCircle size={10} />
          Reported
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
          <List size={10} />
          Listed
        </span>
      );
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      {loading ? (
        <Skeleton className="h-7 w-12 rounded" />
      ) : (
        <p className="text-2xl font-bold text-text-primary">{value}</p>
      )}
      <p className="mt-1 text-xs text-text-muted">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ColdEmailBlocker() {
  // Settings state
  const [settings, setSettings] = useState<ColdEmailSettings>({
    enabled: false,
    mode: "list",
    customCriteria: null,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [customCriteriaInput, setCustomCriteriaInput] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // List state
  const [entries, setEntries] = useState<ColdEmailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "blocked" | "false_positive">("all");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // Test panel state
  const [testThreadId, setTestThreadId] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Row action state: id -> loading
  const [rowActionLoading, setRowActionLoading] = useState<Record<string, boolean>>({});

  // Bulk selection
  const bulk = useBulkSelection();
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Load settings
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void (async () => {
      setSettingsLoading(true);
      try {
        const res = await fetch("/api/cold-emails/settings");
        const json = (await res.json()) as { settings?: ColdEmailSettings; error?: string };
        if (json.error) {
          setSettingsError(json.error);
        } else if (json.settings) {
          setSettings(json.settings);
          setCustomCriteriaInput(json.settings.customCriteria ?? "");
        }
      } catch {
        setSettingsError("Failed to load settings");
      } finally {
        setSettingsLoading(false);
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Load list
  // ---------------------------------------------------------------------------
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        limit: String(LIMIT),
      });
      const res = await fetch(`/api/cold-emails?${params.toString()}`);
      const json = (await res.json()) as ListResponse & { error?: string };
      if (json.error) {
        setListError(json.error);
      } else {
        setEntries(json.coldEmails ?? []);
        setTotal(json.total ?? 0);
      }
    } catch {
      setListError("Failed to load cold email list");
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // ---------------------------------------------------------------------------
  // Derived stats (from full list — we fetch all for stats by passing large limit)
  // ---------------------------------------------------------------------------
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsTotal, setStatsTotal] = useState(0);
  const [statsBlocked, setStatsBlocked] = useState(0);
  const [statsFalsePositive, setStatsFalsePositive] = useState(0);

  useEffect(() => {
    void (async () => {
      setStatsLoading(true);
      try {
        const [allRes, blockedRes, fpRes] = await Promise.all([
          fetch("/api/cold-emails?status=all&limit=1&page=1"),
          fetch("/api/cold-emails?status=blocked&limit=1&page=1"),
          fetch("/api/cold-emails?status=false_positive&limit=1&page=1"),
        ]);
        const [allJson, blockedJson, fpJson] = await Promise.all([
          allRes.json() as Promise<{ total?: number }>,
          blockedRes.json() as Promise<{ total?: number }>,
          fpRes.json() as Promise<{ total?: number }>,
        ]);
        setStatsTotal(allJson.total ?? 0);
        setStatsBlocked(blockedJson.total ?? 0);
        setStatsFalsePositive(fpJson.total ?? 0);
      } catch {
        /* non-critical */
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [entries]); // refresh when list changes

  // ---------------------------------------------------------------------------
  // Save settings
  // ---------------------------------------------------------------------------
  async function saveSettings(patch: Partial<ColdEmailSettings>) {
    setSettingsSaving(true);
    setSettingsError(null);
    const merged = { ...settings, ...patch };
    try {
      const res = await fetch("/api/cold-emails/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: merged.enabled,
          mode: merged.mode,
          customCriteria: merged.customCriteria,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (json.error) {
        setSettingsError(json.error);
      } else {
        setSettings(merged);
      }
    } catch {
      setSettingsError("Failed to save settings");
    } finally {
      setSettingsSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Row actions
  // ---------------------------------------------------------------------------
  async function markFalsePositive(entry: ColdEmailEntry) {
    setRowActionLoading((prev) => ({ ...prev, [entry.id]: true }));
    try {
      await fetch(`/api/cold-emails/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFalsePositive: !entry.isFalsePositive }),
      });
      void loadList();
    } catch {
      /* non-critical */
    } finally {
      setRowActionLoading((prev) => ({ ...prev, [entry.id]: false }));
    }
  }

  async function blockSender(entry: ColdEmailEntry) {
    setRowActionLoading((prev) => ({ ...prev, [`block-${entry.id}`]: true }));
    try {
      // Add sender to sender_classifications as "blocked"
      await fetch("/api/sender-classifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: entry.senderEmail,
          classification: "blocked",
        }),
      });
      // Update action to reported
      await fetch(`/api/cold-emails/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionTaken: "reported" }),
      });
      void loadList();
    } catch {
      /* non-critical */
    } finally {
      setRowActionLoading((prev) => ({ ...prev, [`block-${entry.id}`]: false }));
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk actions
  // ---------------------------------------------------------------------------
  async function bulkMarkFalsePositive() {
    setBulkActionLoading(true);
    try {
      await Promise.all(
        [...bulk.selectedIds].map((id) =>
          fetch(`/api/cold-emails/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFalsePositive: true }),
          }),
        ),
      );
      bulk.deselectAll();
      void loadList();
    } catch {
      /* non-critical */
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkBlockSenders() {
    setBulkActionLoading(true);
    try {
      const selectedEntries = entries.filter((e) => bulk.isSelected(e.id));
      await Promise.all(
        selectedEntries.map((entry) =>
          fetch("/api/sender-classifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              senderEmail: entry.senderEmail,
              classification: "blocked",
            }),
          }),
        ),
      );
      bulk.deselectAll();
      void loadList();
    } catch {
      /* non-critical */
    } finally {
      setBulkActionLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Test panel
  // ---------------------------------------------------------------------------
  async function runTest() {
    if (!testThreadId.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch("/api/cold-emails/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: testThreadId.trim() }),
      });
      const json = (await res.json()) as TestResult & { error?: string };
      if (json.error) {
        setTestError(json.error);
      } else {
        setTestResult(json);
      }
    } catch {
      setTestError("Failed to run test");
    } finally {
      setTestLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Settings section                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldOff size={18} className="text-accent" />
          <h2 className="text-base font-semibold text-text-primary">Cold Email Settings</h2>
        </div>

        {settingsError && (
          <p className="mb-4 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">
            {settingsError}
          </p>
        )}

        {settingsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-64 rounded" />
            <Skeleton className="h-5 w-48 rounded" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Enable Cold Email Detection</p>
                <p className="text-xs text-text-muted">
                  AI scans incoming emails from first-time senders for cold outreach patterns.
                </p>
              </div>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => void saveSettings({ enabled: !settings.enabled })}
                className="shrink-0 text-accent disabled:opacity-50"
                aria-label={settings.enabled ? "Disable cold email detection" : "Enable cold email detection"}
              >
                {settings.enabled ? (
                  <ToggleRight size={32} className="fill-accent" />
                ) : (
                  <ToggleLeft size={32} />
                )}
              </button>
            </div>

            {/* Mode selector */}
            {settings.enabled && (
              <div>
                <p className="mb-2 text-sm font-medium text-text-primary">Action Mode</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: "list", label: "List Only", icon: List, desc: "Log and show in this view" },
                      { value: "label", label: "Auto-label", icon: Tag, desc: "Apply \"Cold Email\" tag" },
                      { value: "archive", label: "Auto-archive", icon: Archive, desc: "Archive + label" },
                    ] as const
                  ).map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={settingsSaving}
                      onClick={() => void saveSettings({ mode: value })}
                      className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                        settings.mode === value
                          ? "border-accent bg-accent-muted text-accent"
                          : "border-border bg-surface-0 text-text-secondary hover:bg-surface-2"
                      }`}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="text-[10px] text-text-muted">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom criteria */}
            {settings.enabled && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  Custom Detection Criteria
                  <span className="ml-1 text-xs font-normal text-text-muted">(optional)</span>
                </label>
                <textarea
                  value={customCriteriaInput}
                  onChange={(e) => setCustomCriteriaInput(e.target.value)}
                  placeholder="e.g. Also flag emails from recruitment agencies, or emails mentioning competitor products..."
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-text-muted">
                    {customCriteriaInput.length}/1000 characters
                  </p>
                  <button
                    type="button"
                    disabled={settingsSaving || customCriteriaInput === (settings.customCriteria ?? "")}
                    onClick={() => void saveSettings({ customCriteria: customCriteriaInput || null })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    {settingsSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                    Save Criteria
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Stats bar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Cold emails detected" value={statsTotal} loading={statsLoading} />
        <StatCard label="Blocked (labeled / archived)" value={statsBlocked} loading={statsLoading} />
        <StatCard label="Marked false positive" value={statsFalsePositive} loading={statsLoading} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Cold email list                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-xl border border-border bg-surface-1">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">Detected Cold Emails</h2>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-surface-0 p-1">
            {(["all", "blocked", "false_positive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-accent text-accent-text"
                    : "text-text-secondary hover:bg-surface-2"
                }`}
              >
                {s === "all" ? "All" : s === "blocked" ? "Blocked" : "False Positives"}
              </button>
            ))}
          </div>
        </div>

        {listError && (
          <p className="px-5 py-4 text-sm text-danger">{listError}</p>
        )}

        {listLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded" />
                  <Skeleton className="h-3 w-72 rounded" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <ShieldOff size={36} className="text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">No cold emails detected yet</p>
            <p className="text-xs text-text-muted">
              {settings.enabled
                ? "Cold emails will appear here as they arrive."
                : "Enable cold email detection above to start blocking unwanted outreach."}
            </p>
          </div>
        ) : (
          <>
            {/* Select-all header row */}
            <div className="flex items-center gap-3 border-b border-border bg-surface-0 px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  const allIds = entries.map((e) => e.id);
                  const allSelected = allIds.every((id) => bulk.isSelected(id));
                  if (allSelected) {
                    bulk.deselectAll();
                  } else {
                    bulk.selectAll(allIds);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
                aria-label={
                  entries.every((e) => bulk.isSelected(e.id))
                    ? "Deselect all"
                    : "Select all"
                }
              >
                {entries.length > 0 && entries.every((e) => bulk.isSelected(e.id)) ? (
                  <CheckSquare size={16} className="text-accent" />
                ) : bulk.selectionCount > 0 ? (
                  <Minus size={16} className="text-accent" />
                ) : (
                  <Square size={16} />
                )}
              </button>
              <span className="text-xs text-text-muted">
                {bulk.selectionCount > 0
                  ? `${bulk.selectionCount} of ${entries.length} selected`
                  : `${entries.length} emails`}
              </span>
              {bulk.selectionCount === 0 && (
                <button
                  type="button"
                  onClick={() => bulk.selectAll(entries.map((e) => e.id))}
                  className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  Select all
                </button>
              )}
            </div>

            {/* Bulk actions toolbar */}
            {bulk.selectionCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/5 px-4 py-2.5">
                <span className="text-xs font-medium text-text-secondary">
                  {bulk.selectionCount} selected
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:ml-2">
                  <button
                    type="button"
                    disabled={bulkActionLoading}
                    onClick={() => void bulkMarkFalsePositive()}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50 sm:h-auto"
                  >
                    {bulkActionLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <XCircle size={12} />
                    )}
                    Not Cold Email
                  </button>
                  <button
                    type="button"
                    disabled={bulkActionLoading}
                    onClick={() => void bulkBlockSenders()}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 sm:h-auto"
                  >
                    {bulkActionLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Ban size={12} />
                    )}
                    Block Sender
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => bulk.deselectAll()}
                  className="ml-auto text-xs text-text-muted transition-colors hover:text-text-secondary"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4 ${
                    entry.isFalsePositive ? "opacity-60" : ""
                  } ${bulk.isSelected(entry.id) ? "bg-accent/5" : ""}`}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => bulk.toggle(entry.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center self-start rounded text-text-muted transition-colors hover:text-accent sm:mt-0.5 sm:h-auto sm:w-auto sm:p-0.5"
                    aria-label={bulk.isSelected(entry.id) ? "Deselect" : "Select"}
                  >
                    {bulk.isSelected(entry.id) ? (
                      <CheckSquare size={16} className="text-accent" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>

                  {/* Main info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {entry.senderEmail}
                      </span>
                      {entry.isFalsePositive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                          <CheckCircle2 size={10} />
                          Not Cold
                        </span>
                      )}
                    </div>
                    <a
                      href={`/thread/${entry.threadId}`}
                      className="mt-0.5 block truncate text-sm text-text-secondary hover:text-accent hover:underline"
                    >
                      {entry.thread.subject || "(no subject)"}
                    </a>
                    {entry.reasoning && (
                      <p className="mt-1 truncate text-xs text-text-muted">{entry.reasoning}</p>
                    )}
                    <p className="mt-1 text-[10px] text-text-muted">{formatDate(entry.detectedAt)}</p>
                  </div>

                  {/* Confidence badge */}
                  <div
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceBg(entry.confidence)} ${confidenceColor(entry.confidence)}`}
                  >
                    {Math.round(entry.confidence * 100)}%
                  </div>

                  {/* Action badge */}
                  <div className="shrink-0">{actionBadge(entry.actionTaken)}</div>

                  {/* Row actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      title={entry.isFalsePositive ? "Undo: mark as cold email" : "Mark as not a cold email"}
                      disabled={rowActionLoading[entry.id]}
                      onClick={() => void markFalsePositive(entry)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      {rowActionLoading[entry.id] ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <XCircle size={12} />
                      )}
                      {entry.isFalsePositive ? "Undo" : "Not Cold"}
                    </button>
                    {!entry.isFalsePositive && entry.actionTaken !== "reported" && (
                      <button
                        type="button"
                        title="Block sender permanently"
                        disabled={rowActionLoading[`block-${entry.id}`]}
                        onClick={() => void blockSender(entry)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {rowActionLoading[`block-${entry.id}`] ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Ban size={12} />
                        )}
                        Block
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-text-muted">
                  Page {page} of {totalPages} ({total} total)
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-border p-1.5 text-text-secondary disabled:opacity-40 hover:bg-surface-2"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border p-1.5 text-text-secondary disabled:opacity-40 hover:bg-surface-2"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Test panel                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="mb-4 flex items-center gap-2">
          <FlaskConical size={18} className="text-accent" />
          <h2 className="text-base font-semibold text-text-primary">Test Classification</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          Run the cold email detector against any thread without taking any action.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={testThreadId}
            onChange={(e) => setTestThreadId(e.target.value)}
            placeholder="Paste a thread ID..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            disabled={testLoading || !testThreadId.trim()}
            onClick={() => void runTest()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {testLoading ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
            Test
          </button>
        </div>

        {testError && (
          <p className="mt-3 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">{testError}</p>
        )}

        {testResult && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              testResult.isColdEmail
                ? confidenceBg(testResult.confidence)
                : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {testResult.isColdEmail ? (
                  <ShieldOff size={16} className={confidenceColor(testResult.confidence)} />
                ) : (
                  <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                )}
                <span
                  className={`text-sm font-semibold ${
                    testResult.isColdEmail
                      ? confidenceColor(testResult.confidence)
                      : "text-green-700 dark:text-green-300"
                  }`}
                >
                  {testResult.isColdEmail ? "Cold Email Detected" : "Not a Cold Email"}
                </span>
              </div>
              <span
                className={`text-sm font-bold ${
                  testResult.isColdEmail
                    ? confidenceColor(testResult.confidence)
                    : "text-green-600 dark:text-green-400"
                }`}
              >
                {Math.round(testResult.confidence * 100)}% confidence
              </span>
            </div>

            <p className="mb-3 text-sm text-text-secondary">{testResult.reasoning}</p>

            <div className="mb-3 flex items-center gap-1.5 text-xs text-text-muted">
              <Info size={12} />
              Sender: {testResult.senderEmail} — {testResult.senderHistory} prior message
              {testResult.senderHistory !== 1 ? "s" : ""}
            </div>

            {testResult.signals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {testResult.signals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full bg-surface-0/60 px-2.5 py-0.5 text-[10px] font-medium text-text-secondary"
                  >
                    {signal.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
