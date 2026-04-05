"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Plus,
  Loader2,
  ShieldOff,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

type ScopeType = "sender" | "domain" | "category";

interface AutoSendRule {
  id: string;
  scopeType: ScopeType;
  scopeValue: string;
  enabled: boolean;
  createdAt: string;
}

interface AutoSendConfigData {
  configs: AutoSendRule[];
  killSwitch: boolean;
  sendsThisHour: number;
}

const SCOPE_LABELS: Record<ScopeType, string> = {
  sender: "Sender email",
  domain: "Domain",
  category: "AI category",
};

export function AutoSendConfig() {
  const toast = useToast();
  const [data, setData] = useState<AutoSendConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scopeType, setScopeType] = useState<ScopeType>("sender");
  const [scopeValue, setScopeValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingKill, setTogglingKill] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auto-send/config");
      if (!res.ok) return;
      const json = (await res.json()) as Partial<AutoSendConfigData>;
      setData({
        configs: json.configs ?? [],
        killSwitch: json.killSwitch ?? false,
        sendsThisHour: json.sendsThisHour ?? 0,
      });
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAddRule() {
    if (!scopeValue.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/auto-send/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope_type: scopeType, scope_value: scopeValue.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to add rule", "error");
        return;
      }
      setScopeValue("");
      toast.show("Auto-send rule added.", "success");
      void refresh();
    } catch {
      toast.show("Failed to add rule", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleRule(id: string, enabled: boolean) {
    if (!data) return;
    const rule = data.configs.find((r) => r.id === id);
    if (!rule) return;
    setTogglingId(id);
    try {
      const res = await fetch("/api/auto-send/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope_type: rule.scopeType,
          scope_value: rule.scopeValue,
          enabled: !enabled,
        }),
      });
      if (!res.ok) {
        toast.show("Failed to update rule", "error");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              configs: prev.configs.map((r) =>
                r.id === id ? { ...r, enabled: !enabled } : r,
              ),
            }
          : prev,
      );
    } catch {
      toast.show("Failed to update rule", "error");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDeleteRule(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/auto-send/config?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.show("Failed to delete rule", "error");
        return;
      }
      setData((prev) =>
        prev ? { ...prev, rules: prev.configs.filter((r) => r.id !== id) } : prev,
      );
      toast.show("Rule removed.", "info");
    } catch {
      toast.show("Failed to delete rule", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleKillSwitch() {
    if (!data) return;
    setTogglingKill(true);
    try {
      const res = await fetch("/api/auto-send/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !data.killSwitch }),
      });
      if (!res.ok) {
        toast.show("Failed to toggle kill switch", "error");
        return;
      }
      const newState = !data.killSwitch;
      setData((prev) => (prev ? { ...prev, killSwitch: newState } : prev));
      toast.show(
        newState ? "Auto-send disabled (kill switch ON)." : "Auto-send re-enabled.",
        newState ? "info" : "success",
      );
    } catch {
      toast.show("Failed to toggle kill switch", "error");
    } finally {
      setTogglingKill(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    );
  }

  const killActive = data?.killSwitch ?? false;

  return (
    <div className="space-y-5">
      {/* Kill switch */}
      <div
        className={`flex items-center gap-4 rounded-xl border-2 px-4 py-3 transition-colors ${
          killActive
            ? "border-danger/50 bg-danger-muted"
            : "border-border bg-surface-0"
        }`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <ShieldOff size={16} className={killActive ? "text-danger" : "text-text-muted"} />
            <span className="text-sm font-semibold text-text-primary">Kill Switch</span>
            {killActive && (
              <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Active
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {killActive
              ? "Auto-send is paused. No emails will be sent automatically."
              : "Auto-send is operational. Toggle to pause all automatic sending."}
          </p>
        </div>
        <button
          type="button"
          disabled={togglingKill}
          onClick={handleToggleKillSwitch}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            killActive
              ? "bg-success-muted text-success hover:bg-success/20"
              : "bg-danger text-white hover:bg-danger/80"
          }`}
        >
          {togglingKill ? (
            <Loader2 size={14} className="animate-spin" />
          ) : killActive ? (
            <Shield size={14} />
          ) : (
            <ShieldOff size={14} />
          )}
          {killActive ? "Re-enable" : "Disable All"}
        </button>
      </div>

      {/* Rate indicator */}
      {data && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-0 px-3 py-2">
          <Send size={14} className="text-text-muted" />
          <span className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{data.sendsThisHour}</span> auto-sends this hour
          </span>
          {data.sendsThisHour > 10 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} />
              High volume
            </span>
          )}
        </div>
      )}

      {/* Add rule */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Add Auto-Send Rule
        </p>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as ScopeType)}
              className="appearance-none rounded-lg border border-border bg-surface-0 py-2 pl-3 pr-8 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {(Object.keys(SCOPE_LABELS) as ScopeType[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
          </div>
          <input
            type="text"
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            placeholder={
              scopeType === "sender"
                ? "sender@example.com"
                : scopeType === "domain"
                ? "example.com"
                : "billing"
            }
            className="flex-1 rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddRule();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleAddRule()}
            disabled={adding || !scopeValue.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
      </div>

      {/* Rules list */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Active Rules ({data?.configs.length ?? 0})
        </p>
        {!data || data.configs.length === 0 ? (
          <EmptyState
            icon={Send}
            title="No auto-send rules"
            description="Add rules to let AI automatically send replies matching specific senders, domains, or categories."
          />
        ) : (
          <ul className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border">
            {data.configs.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 ${
                  !rule.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {rule.scopeValue}
                  </p>
                  <p className="text-xs capitalize text-text-muted">
                    {SCOPE_LABELS[rule.scopeType]}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={togglingId === rule.id}
                  onClick={() => handleToggleRule(rule.id, rule.enabled)}
                  title={rule.enabled ? "Disable rule" : "Enable rule"}
                  className="rounded-full p-1 text-text-muted transition-colors hover:text-accent"
                  aria-label={rule.enabled ? "Disable" : "Enable"}
                >
                  {togglingId === rule.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : rule.enabled ? (
                    <ToggleRight size={20} className="text-accent" />
                  ) : (
                    <ToggleLeft size={20} />
                  )}
                </button>
                <button
                  type="button"
                  disabled={deletingId === rule.id}
                  onClick={() => handleDeleteRule(rule.id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-50"
                  aria-label="Remove rule"
                >
                  {deletingId === rule.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
