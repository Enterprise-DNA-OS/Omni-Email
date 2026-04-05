"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FolderOpen,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  Settings2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  X,
  RotateCcw,
  Loader2,
  HardDrive,
  Square,
  CheckSquare,
  Minus,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { useBulkSelection } from "@/hooks/useBulkSelection";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilingStatus = "pending" | "filing" | "filed" | "rejected" | "failed";

interface FilingRow {
  id: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  storage_provider: "google_drive" | "onedrive";
  destination_folder: string | null;
  destination_folder_id: string | null;
  storage_file_id: string | null;
  storage_url: string | null;
  status: FilingStatus;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  error_message: string | null;
  filed_at: string | null;
  created_at: string;
  thread_id: string | null;
  message_id: string | null;
  account_id: string;
}

interface FilingConfig {
  id: string;
  account_id: string;
  enabled: boolean;
  storage_provider: "google_drive" | "onedrive";
  root_folder_id: string | null;
  root_folder_name: string | null;
  auto_file: boolean;
}

interface FolderOption {
  id: string;
  name: string;
  path?: string;
}

interface Account {
  id: string;
  provider: string;
  email_address: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<FilingStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
  filing: { label: "Filing…", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Loader2 },
  filed: { label: "Filed", className: "bg-green-500/15 text-green-600 dark:text-green-400", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-text-muted/15 text-text-muted", icon: XCircle },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-600 dark:text-red-400", icon: AlertCircle },
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function providerLabel(p: "google_drive" | "onedrive"): string {
  return p === "google_drive" ? "Google Drive" : "OneDrive";
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FilingStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <Icon size={11} className={status === "filing" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

// ─── Filing Row ───────────────────────────────────────────────────────────────

function FilingTableRow({
  filing,
  isSelected,
  onToggle,
  onApprove,
  onReject,
  onRetry,
}: {
  filing: FilingRow;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className={`border-b border-border transition-colors hover:bg-surface-2/50 ${isSelected ? "bg-accent/5" : ""}`}>
        {/* Checkbox cell — 44px min touch target height via py-2.5 */}
        <td className="w-10 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onToggle(filing.id)}
            className="flex h-5 w-5 items-center justify-center text-text-muted transition-colors hover:text-accent"
            aria-label={isSelected ? "Deselect row" : "Select row"}
          >
            {isSelected ? (
              <CheckSquare size={16} className="text-accent" />
            ) : (
              <Square size={16} />
            )}
          </button>
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            {expanded ? <ChevronUp size={14} className="shrink-0 text-text-muted" /> : <ChevronDown size={14} className="shrink-0 text-text-muted" />}
            <span className="text-sm font-medium text-text-primary truncate max-w-[200px]">
              {filing.filename}
            </span>
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          {filing.destination_folder ?? <span className="text-text-muted italic">Unassigned</span>}
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          {providerLabel(filing.storage_provider)}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={filing.status} />
        </td>
        <td className="px-4 py-3 text-sm text-text-muted">
          {formatDate(filing.created_at)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {filing.status === "filed" && filing.storage_url && (
              <a
                href={filing.storage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
                title="Open in storage"
              >
                <ExternalLink size={14} />
              </a>
            )}
            {filing.status === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(filing.id)}
                  className="rounded p-1 text-text-muted hover:text-green-600 hover:bg-green-500/10 transition-colors"
                  title="Approve and file"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onReject(filing.id)}
                  className="rounded p-1 text-text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors"
                  title="Reject"
                >
                  <X size={14} />
                </button>
              </>
            )}
            {filing.status === "failed" && (
              <button
                type="button"
                onClick={() => onRetry(filing.id)}
                className="rounded p-1 text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
                title="Retry"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-surface-2/30">
          <td colSpan={7} className="px-8 py-3">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              {filing.file_size != null && (
                <div>
                  <span className="text-text-muted">Size</span>
                  <p className="text-text-primary">{formatBytes(filing.file_size)}</p>
                </div>
              )}
              {filing.mime_type && (
                <div>
                  <span className="text-text-muted">Type</span>
                  <p className="text-text-primary">{filing.mime_type}</p>
                </div>
              )}
              {filing.ai_confidence != null && (
                <div>
                  <span className="text-text-muted">AI Confidence</span>
                  <p className="text-text-primary">{Math.round(filing.ai_confidence * 100)}%</p>
                </div>
              )}
              {filing.ai_reasoning && (
                <div className="col-span-2 md:col-span-3">
                  <span className="text-text-muted">AI Reasoning</span>
                  <p className="text-text-primary">{filing.ai_reasoning}</p>
                </div>
              )}
              {filing.error_message && (
                <div className="col-span-2 md:col-span-3">
                  <span className="text-red-500">Error</span>
                  <p className="text-red-600 dark:text-red-400">{filing.error_message}</p>
                </div>
              )}
              {filing.filed_at && (
                <div>
                  <span className="text-text-muted">Filed at</span>
                  <p className="text-text-primary">{formatDate(filing.filed_at)}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({
  accounts,
  configs,
  onSave,
}: {
  accounts: Account[];
  configs: FilingConfig[];
  onSave: (config: Partial<FilingConfig> & { accountId: string }) => Promise<void>;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [localConfigs, setLocalConfigs] = useState<Map<string, FilingConfig>>(
    new Map(configs.map((c) => [c.account_id, c])),
  );

  useEffect(() => {
    setLocalConfigs(new Map(configs.map((c) => [c.account_id, c])));
  }, [configs]);

  function getConfig(accountId: string): Partial<FilingConfig> {
    return localConfigs.get(accountId) ?? {};
  }

  function setField<K extends keyof FilingConfig>(accountId: string, key: K, value: FilingConfig[K]) {
    setLocalConfigs((prev) => {
      const next = new Map(prev);
      const existing = next.get(accountId) ?? ({ account_id: accountId } as FilingConfig);
      next.set(accountId, { ...existing, [key]: value });
      return next;
    });
  }

  async function handleSave(accountId: string) {
    const cfg = localConfigs.get(accountId);
    if (!cfg) return;
    setSaving(accountId);
    try {
      await onSave({
        accountId,
        enabled: cfg.enabled ?? false,
        storage_provider: cfg.storage_provider ?? "google_drive",
        root_folder_id: cfg.root_folder_id ?? null,
        root_folder_name: cfg.root_folder_name ?? null,
        auto_file: cfg.auto_file ?? false,
      });
      toast.show("Filing config saved", "success");
    } catch {
      toast.show("Failed to save config", "error");
    } finally {
      setSaving(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-text-muted py-4">
        No email accounts connected. Connect an account in Settings first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((account) => {
        const cfg = getConfig(account.id);
        const defaultProvider: "google_drive" | "onedrive" =
          account.provider === "gmail" ? "google_drive" : "onedrive";

        return (
          <div key={account.id} className="rounded-xl border border-border bg-surface-1 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{account.email_address}</p>
                <p className="text-xs text-text-muted capitalize">{account.provider}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <span className="text-sm text-text-secondary">Enabled</span>
                <input
                  type="checkbox"
                  checked={cfg.enabled ?? false}
                  onChange={(e) => setField(account.id, "enabled", e.target.checked)}
                  className="h-4 w-4 rounded accent-accent"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  Storage Provider
                </label>
                <select
                  value={cfg.storage_provider ?? defaultProvider}
                  onChange={(e) =>
                    setField(account.id, "storage_provider", e.target.value as "google_drive" | "onedrive")
                  }
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="google_drive">Google Drive</option>
                  <option value="onedrive">OneDrive</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  Root Folder Name
                </label>
                <input
                  type="text"
                  value={cfg.root_folder_name ?? ""}
                  onChange={(e) => setField(account.id, "root_folder_name", e.target.value || null)}
                  placeholder="e.g. Email Attachments"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.auto_file ?? false}
                onChange={(e) => setField(account.id, "auto_file", e.target.checked)}
                className="h-4 w-4 rounded accent-accent"
              />
              <span className="text-sm text-text-secondary">
                Auto-file attachments on sync (no manual approval needed)
              </span>
            </label>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSave(account.id)}
                disabled={saving === account.id}
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-text transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving === account.id && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type TabId = "all" | "pending" | "filed" | "failed" | "rejected";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "filed", label: "Filed" },
  { id: "failed", label: "Failed" },
  { id: "rejected", label: "Rejected" },
];

export function FilingDashboard() {
  const toast = useToast();
  const bulk = useBulkSelection();

  const [tab, setTab] = useState<TabId>("all");
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkActioning, setBulkActioning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configs, setConfigs] = useState<FilingConfig[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const loadFilings = useCallback(async (statusFilter: TabId) => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/filing?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as { filings: FilingRow[]; total: number };
    setFilings(data.filings);
    setTotal(data.total);
  }, []);

  const loadConfig = useCallback(async () => {
    const [cfgRes, accRes] = await Promise.all([
      fetch("/api/filing/config"),
      fetch("/api/accounts"),
    ]);
    if (cfgRes.ok) {
      const d = (await cfgRes.json()) as { configs: FilingConfig[] };
      setConfigs(d.configs);
    }
    if (accRes.ok) {
      const d = (await accRes.json()) as { accounts?: Account[]; data?: Account[] };
      setAccounts(d.accounts ?? d.data ?? []);
    }
  }, []);

  useEffect(() => {
    bulk.deselectAll();
    setLoading(true);
    Promise.all([loadFilings(tab), loadConfig()]).finally(() => setLoading(false));
    // bulk.deselectAll is stable (useCallback with no deps), intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loadFilings, loadConfig]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadFilings(tab);
    setRefreshing(false);
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/filing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (res.ok) {
      toast.show("Filing approved", "success");
      await loadFilings(tab);
    } else {
      toast.show("Failed to approve", "error");
    }
  }

  async function handleReject(id: string) {
    const res = await fetch(`/api/filing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    if (res.ok) {
      toast.show("Filing rejected", "success");
      await loadFilings(tab);
    } else {
      toast.show("Failed to reject", "error");
    }
  }

  async function handleRetry(id: string) {
    const res = await fetch(`/api/filing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    if (res.ok) {
      toast.show("Filing retried", "success");
      await loadFilings(tab);
    } else {
      toast.show("Failed to retry", "error");
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    setBulkActioning(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/filing/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "filed" }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed === 0) {
        toast.show(`${ids.length} filing${ids.length === 1 ? "" : "s"} approved`, "success");
      } else {
        toast.show(`${ids.length - failed} approved, ${failed} failed`, "error");
      }
      bulk.deselectAll();
      await loadFilings(tab);
    } finally {
      setBulkActioning(false);
    }
  }

  async function handleBulkReject() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    setBulkActioning(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/filing/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "rejected" }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed === 0) {
        toast.show(`${ids.length} filing${ids.length === 1 ? "" : "s"} rejected`, "success");
      } else {
        toast.show(`${ids.length - failed} rejected, ${failed} failed`, "error");
      }
      bulk.deselectAll();
      await loadFilings(tab);
    } finally {
      setBulkActioning(false);
    }
  }

  async function handleSaveConfig(cfg: Partial<FilingConfig> & { accountId: string }) {
    const res = await fetch("/api/filing/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: cfg.accountId,
        enabled: cfg.enabled,
        storageProvider: cfg.storage_provider,
        rootFolderId: cfg.root_folder_id,
        rootFolderName: cfg.root_folder_name,
        autoFile: cfg.auto_file,
      }),
    });
    if (!res.ok) throw new Error("Save failed");
    await loadConfig();
  }

  // Compute stats
  const pending = filings.filter((f) => f.status === "pending").length;
  const filed = filings.filter((f) => f.status === "filed").length;
  const failed = filings.filter((f) => f.status === "failed").length;
  const successRate =
    filed + failed > 0 ? Math.round((filed / (filed + failed)) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Document Filing</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Auto-file email attachments to Google Drive or OneDrive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              showConfig
                ? "border-accent bg-accent-muted text-accent"
                : "border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            <Settings2 size={14} />
            Configure
          </button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Filing Configuration</h2>
          <ConfigPanel accounts={accounts} configs={configs} onSave={handleSaveConfig} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: total, icon: HardDrive, color: "text-text-primary" },
          { label: "Pending", value: pending, icon: Clock, color: "text-amber-500" },
          { label: "Filed", value: filed, icon: CheckCircle2, color: "text-green-500" },
          {
            label: "Success Rate",
            value: successRate != null ? `${successRate}%` : "—",
            icon: FolderOpen,
            color: "text-accent",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-surface-1 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} className={color} />
              <span className="text-xs text-text-muted">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "border-b-2 border-accent text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-text-muted" />
        </div>
      ) : filings.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No filings yet"
          description={
            tab === "all"
              ? "Configure filing for an account to start auto-filing attachments."
              : `No ${tab} filings.`
          }
          action={
            tab === "all" ? (
              <button
                type="button"
                onClick={() => setShowConfig(true)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:opacity-90"
              >
                Configure Filing
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          {/* Bulk actions toolbar — shown when any rows are selected */}
          {bulk.selectionCount > 0 && (
            <div className="flex items-center gap-3 border-b border-border bg-accent/5 px-4 py-2.5">
              <span className="text-sm font-medium text-text-primary">
                {bulk.selectionCount} selected
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => void handleBulkApprove()}
                  disabled={bulkActioning}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {bulkActioning ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkReject()}
                  disabled={bulkActioning}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {bulkActioning ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <X size={14} />
                  )}
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => bulk.deselectAll()}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-left">
            <thead>
              {/* Select-all header row */}
              <tr className="border-b border-border bg-surface-0">
                <th colSpan={7} className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = filings.map((f) => f.id);
                        const allSelected = allIds.every((id) => bulk.isSelected(id));
                        if (allSelected) {
                          bulk.deselectAll();
                        } else {
                          bulk.selectAll(allIds);
                        }
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-accent"
                      aria-label={
                        filings.every((f) => bulk.isSelected(f.id))
                          ? "Deselect all"
                          : "Select all"
                      }
                    >
                      {filings.length > 0 && filings.every((f) => bulk.isSelected(f.id)) ? (
                        <CheckSquare size={16} className="text-accent" />
                      ) : bulk.selectionCount > 0 ? (
                        <Minus size={16} className="text-accent" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                    <span className="text-xs text-text-muted">
                      {bulk.selectionCount > 0
                        ? `${bulk.selectionCount} of ${filings.length} selected`
                        : `${filings.length} filing${filings.length === 1 ? "" : "s"}`}
                    </span>
                    {bulk.selectionCount === 0 && (
                      <button
                        type="button"
                        onClick={() => bulk.selectAll(filings.map((f) => f.id))}
                        className="ml-auto text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                      >
                        Select all
                      </button>
                    )}
                  </div>
                </th>
              </tr>
              {/* Column headers */}
              <tr className="border-b border-border bg-surface-2/50">
                <th className="w-10 px-3 py-3" aria-label="Select" />
                <th className="px-4 py-3 text-xs font-medium text-text-muted">Filename</th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted">Destination</th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted">Provider</th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted">Date</th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((filing) => (
                <FilingTableRow
                  key={filing.id}
                  filing={filing}
                  isSelected={bulk.isSelected(filing.id)}
                  onToggle={bulk.toggle}
                  onApprove={(id) => void handleApprove(id)}
                  onReject={(id) => void handleReject(id)}
                  onRetry={(id) => void handleRetry(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
