"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Filter,
  ToggleLeft,
  ToggleRight,
  Play,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Modal } from "@/components/Modal";
import { RuleBuilder, type RuleData } from "@/components/RuleBuilder";

interface Rule extends RuleData {
  id: string;
  matchCount?: number;
  lastMatchedAt?: string | null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RulesList() {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { rules?: Rule[]; error?: string };
      setRules(data.rules ?? []);
    } catch {
      toast.show("Failed to load rules", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  async function handleDelete(id: string, name: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.show("Failed to delete rule", "error");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.show(`Rule "${name}" deleted.`, "info");
    } catch {
      toast.show("Failed to delete rule", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(rule: Rule) {
    setTogglingId(rule.id);
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) {
        toast.show("Failed to update rule", "error");
        return;
      }
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
      );
    } catch {
      toast.show("Failed to update rule", "error");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRun(rule: Rule) {
    setRunningId(rule.id);
    try {
      const res = await fetch(`/api/rules/${rule.id}/run`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to run rule", "error");
        return;
      }
      const result = (await res.json()) as {
        matched?: number;
        acted?: number;
        totalScanned?: number;
        errors?: string[];
      };
      const matched = result.matched ?? 0;
      const acted = result.acted ?? 0;
      const errorCount = result.errors?.length ?? 0;

      if (matched === 0) {
        toast.show(`"${rule.name}" — no matching threads found (scanned ${result.totalScanned ?? 0}).`, "info");
      } else if (errorCount > 0) {
        toast.show(`"${rule.name}" — ${acted} of ${matched} threads processed, ${errorCount} failed.`, "error");
      } else {
        toast.show(`"${rule.name}" — ran on ${acted} thread${acted !== 1 ? "s" : ""} successfully.`, "success");
      }

      // Refresh to update match counts
      void fetchRules();
    } catch {
      toast.show("Failed to run rule", "error");
    } finally {
      setRunningId(null);
    }
  }

  function openCreate() {
    setEditingRule(undefined);
    setShowBuilder(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule as Rule);
    setShowBuilder(true);
  }

  function handleSaved(savedRule: RuleData) {
    if (!savedRule.id) return;
    const rule = savedRule as Rule;
    setRules((prev) => {
      const exists = prev.some((r) => r.id === rule.id);
      return exists
        ? prev.map((r) => (r.id === rule.id ? { ...r, ...rule } : r))
        : [rule, ...prev];
    });
    setShowBuilder(false);
  }

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Automation Rules</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Rules run against incoming emails in priority order.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
        >
          <Plus size={15} />
          Create Rule
        </button>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        {loading ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-5 w-12 rounded" />
                <Skeleton className="ml-auto h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="No rules yet"
            description="Create automation rules to organize your inbox automatically."
            action={
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
              >
                <Plus size={15} />
                Create your first rule
              </button>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                  Priority
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-muted sm:table-cell">
                  Matches
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-muted md:table-cell">
                  Last Matched
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className={`group transition-colors hover:bg-surface-2 ${!rule.enabled ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {rule.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {rule.priority}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-text-muted sm:table-cell">
                    {rule.matchCount ?? 0}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-text-muted md:table-cell">
                    {formatDate(rule.lastMatchedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={togglingId === rule.id}
                      onClick={() => handleToggle(rule)}
                      title={rule.enabled ? "Disable rule" : "Enable rule"}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                        rule.enabled
                          ? "bg-success-muted text-success"
                          : "bg-surface-2 text-text-muted"
                      }`}
                    >
                      {togglingId === rule.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : rule.enabled ? (
                        <ToggleRight size={11} />
                      ) : (
                        <ToggleLeft size={11} />
                      )}
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={runningId === rule.id || !rule.enabled}
                        onClick={() => handleRun(rule)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
                        title="Run this rule now against all inbox threads"
                      >
                        {runningId === rule.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Play size={13} />
                        )}
                        <span className="hidden sm:inline">Run</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(rule)}
                        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                        title="Edit rule"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === rule.id}
                        onClick={() => handleDelete(rule.id, rule.name)}
                        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-40"
                        title="Delete rule"
                      >
                        {deletingId === rule.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rule Builder Modal */}
      <Modal
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        title={editingRule ? "Edit Rule" : "Create Rule"}
        size="lg"
      >
        <RuleBuilder
          rule={editingRule}
          onSaved={handleSaved}
          onCancel={() => setShowBuilder(false)}
        />
      </Modal>
    </>
  );
}
