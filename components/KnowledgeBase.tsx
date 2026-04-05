"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Lightbulb,
  Settings,
  ListChecks,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Loader2,
  Globe,
  User,
  Building2,
  Tag,
  ToggleLeft,
  ToggleRight,
  Square,
  CheckSquare,
  Minus,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useBulkSelection } from "@/hooks/useBulkSelection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KnowledgeType = "fact" | "preference" | "procedure" | "snippet";
type KnowledgeScope = "global" | "sender" | "domain" | "topic";
type FilterTab = "all" | KnowledgeType;

interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  title: string;
  content: string;
  scope: KnowledgeScope;
  scope_value: string | null;
  usage_count: number;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface KnowledgeStats {
  total: number;
  byType: Record<string, number>;
  mostUsed: { id: string; title: string; usage_count: number } | null;
  addedThisMonth: number;
}

interface EntryFormState {
  type: KnowledgeType;
  title: string;
  content: string;
  scope: KnowledgeScope;
  scope_value: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fact", label: "Facts" },
  { key: "preference", label: "Preferences" },
  { key: "procedure", label: "Procedures" },
  { key: "snippet", label: "Snippets" },
];

const TYPE_META: Record<
  KnowledgeType,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; color: string }
> = {
  fact: { label: "Fact", icon: Lightbulb, color: "text-amber-500" },
  preference: { label: "Preference", icon: Settings, color: "text-blue-500" },
  procedure: { label: "Procedure", icon: ListChecks, color: "text-green-500" },
  snippet: { label: "Snippet", icon: FileText, color: "text-purple-500" },
};

const SCOPE_META: Record<
  KnowledgeScope,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }> }
> = {
  global: { label: "Global", icon: Globe },
  sender: { label: "Sender", icon: User },
  domain: { label: "Domain", icon: Building2 },
  topic: { label: "Topic", icon: Tag },
};

const EMPTY_FORM: EntryFormState = {
  type: "fact",
  title: "",
  content: "",
  scope: "global",
  scope_value: "",
  is_active: true,
};

const SCOPE_PLACEHOLDER: Record<KnowledgeScope, string> = {
  global: "",
  sender: "e.g. john@example.com",
  domain: "e.g. example.com",
  topic: "e.g. pricing",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatsBanner({ stats }: { stats: KnowledgeStats | null }) {
  if (!stats) {
    return (
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-1 p-4">
            <Skeleton className="mb-2 h-6 w-12 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
        <p className="mt-0.5 text-xs text-text-muted">Total entries</p>
      </div>
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <p className="text-2xl font-bold text-text-primary">{stats.addedThisMonth}</p>
        <p className="mt-0.5 text-xs text-text-muted">Added this month</p>
      </div>
      {stats.mostUsed ? (
        <div className="col-span-2 rounded-xl border border-border bg-surface-1 p-4 sm:col-span-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {stats.mostUsed.title}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Most used &middot; {stats.mostUsed.usage_count} uses
          </p>
        </div>
      ) : (
        <div className="col-span-2 rounded-xl border border-border bg-surface-1 p-4 sm:col-span-1">
          <p className="text-sm text-text-muted">No usage data yet</p>
          <p className="mt-0.5 text-xs text-text-muted">Most used entry</p>
        </div>
      )}
    </div>
  );
}

interface EntryCardProps {
  entry: KnowledgeEntry;
  onEdit: (entry: KnowledgeEntry) => void;
  onDelete: (id: string) => void;
  onToggleActive: (entry: KnowledgeEntry) => void;
  toggling: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  selectionMode: boolean;
}

function EntryCard({ entry, onEdit, onDelete, onToggleActive, toggling, isSelected, onToggleSelect, selectionMode }: EntryCardProps) {
  const meta = TYPE_META[entry.type];
  const scopeMeta = SCOPE_META[entry.scope];
  const Icon = meta.icon;
  const ScopeIcon = scopeMeta.icon;

  return (
    <div
      className={`group rounded-xl border transition-opacity ${
        isSelected
          ? "border-accent bg-accent/5"
          : "border-border bg-surface-1"
      } ${entry.is_active ? "opacity-100" : "opacity-60"} p-4`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggleSelect(entry.id)}
          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-all hover:text-accent sm:h-5 sm:w-5 sm:p-0 ${
            isSelected || selectionMode
              ? "opacity-100"
              : "opacity-0 focus:opacity-100 group-hover:opacity-100"
          }`}
          aria-label={isSelected ? "Deselect entry" : "Select entry"}
        >
          {isSelected ? (
            <CheckSquare size={16} className="text-accent" />
          ) : (
            <Square size={16} />
          )}
        </button>

        {/* Type icon */}
        <div className="mt-0.5 shrink-0">
          <Icon size={18} className={meta.color} strokeWidth={1.8} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary">{entry.title}</h3>
            {/* Scope badge */}
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-muted">
              <ScopeIcon size={10} />
              {scopeMeta.label}
              {entry.scope_value && (
                <span className="font-normal">: {entry.scope_value}</span>
              )}
            </span>
            {/* Type badge */}
            <span
              className={`inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium ${meta.color}`}
            >
              {meta.label}
            </span>
          </div>

          <p className="mt-1.5 line-clamp-3 text-sm text-text-secondary">
            {entry.content}
          </p>

          {entry.usage_count > 0 && (
            <p className="mt-2 text-xs text-text-muted">
              Used {entry.usage_count} time{entry.usage_count !== 1 ? "s" : ""} by AI
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Active toggle */}
          <button
            type="button"
            onClick={() => onToggleActive(entry)}
            disabled={toggling}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
            title={entry.is_active ? "Deactivate" : "Activate"}
          >
            {entry.is_active ? (
              <ToggleRight size={16} className="text-green-500" />
            ) : (
              <ToggleLeft size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            title="Edit"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface EntryFormProps {
  initial?: EntryFormState;
  onSave: (form: EntryFormState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function EntryForm({ initial = EMPTY_FORM, onSave, onCancel, saving }: EntryFormProps) {
  const [form, setForm] = useState<EntryFormState>(initial);

  function set<K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave(form);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Type selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">Type</label>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TYPE_META) as KnowledgeType[]).map((t) => {
            const m = TYPE_META[t];
            const TypeIcon = m.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => set("type", t)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  form.type === t
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
                }`}
              >
                <TypeIcon size={13} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Short descriptive title"
          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Content */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">
          Content <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={form.type === "snippet" ? 6 : 3}
          value={form.content}
          onChange={(e) => set("content", e.target.value)}
          placeholder={
            form.type === "snippet"
              ? "The reply snippet text to use verbatim or adapt..."
              : form.type === "fact"
              ? "The fact the AI should know..."
              : form.type === "preference"
              ? "Your preference the AI should follow..."
              : "The procedure or steps to follow..."
          }
          className="w-full resize-y rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Scope selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">Scope</label>
        <select
          value={form.scope}
          onChange={(e) => set("scope", e.target.value as KnowledgeScope)}
          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="global">Global — apply to all emails</option>
          <option value="sender">Sender — specific email address</option>
          <option value="domain">Domain — all emails from a domain</option>
          <option value="topic">Topic — emails about a topic</option>
        </select>
      </div>

      {/* Scope value */}
      {form.scope !== "global" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            {SCOPE_META[form.scope].label} value <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.scope_value}
            onChange={(e) => set("scope_value", e.target.value)}
            placeholder={SCOPE_PLACEHOLDER[form.scope]}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set("is_active", !form.is_active)}
          className="text-text-secondary"
        >
          {form.is_active ? (
            <ToggleRight size={22} className="text-green-500" />
          ) : (
            <ToggleLeft size={22} />
          )}
        </button>
        <span className="text-sm text-text-secondary">
          {form.is_active ? "Active — AI will use this entry" : "Inactive — AI will skip this entry"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent/90 disabled:opacity-60"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save entry
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KnowledgeBase() {
  const toast = useToast();
  const bulk = useBulkSelection();

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Bulk action state
  const [bulkWorking, setBulkWorking] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchEntries = useCallback(
    async (tab: FilterTab, searchQuery: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (tab !== "all") params.set("type", tab);
        if (searchQuery) params.set("search", searchQuery);
        const res = await fetch(`/api/knowledge?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load knowledge entries");
        const data = (await res.json()) as { entries?: KnowledgeEntry[] };
        setEntries(data.entries ?? []);
      } catch {
        toast.show("Failed to load knowledge entries", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/stats");
      if (!res.ok) return;
      const data = (await res.json()) as KnowledgeStats;
      setStats(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    void fetchEntries(filter, search);
  }, [filter, search, fetchEntries]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Clear selection when filter or search changes to avoid stale IDs
  useEffect(() => {
    bulk.deselectAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ---------------------------------------------------------------------------
  // CRUD handlers
  // ---------------------------------------------------------------------------

  async function handleSave(form: EntryFormState) {
    setSaving(true);
    try {
      const isEdit = !!editingEntry;
      const url = isEdit ? `/api/knowledge/${editingEntry!.id}` : "/api/knowledge";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scope_value: form.scope === "global" ? null : form.scope_value.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }

      const data = (await res.json()) as { entry: KnowledgeEntry };
      if (isEdit) {
        setEntries((prev) =>
          prev.map((e) => (e.id === data.entry.id ? data.entry : e)),
        );
        toast.show("Entry updated", "success");
      } else {
        setEntries((prev) => [data.entry, ...prev]);
        toast.show("Entry added", "success");
      }

      setModalOpen(false);
      setEditingEntry(null);
      void fetchStats();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Failed to save entry", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.show("Entry deleted", "success");
      void fetchStats();
    } catch {
      toast.show("Failed to delete entry", "error");
    }
  }

  async function handleToggleActive(entry: KnowledgeEntry) {
    setTogglingId(entry.id);
    try {
      const res = await fetch(`/api/knowledge/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !entry.is_active }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = (await res.json()) as { entry: KnowledgeEntry };
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? data.entry : e)));
    } catch {
      toast.show("Failed to update entry", "error");
    } finally {
      setTogglingId(null);
    }
  }

  function openAddModal() {
    setEditingEntry(null);
    setModalOpen(true);
  }

  function openEditModal(entry: KnowledgeEntry) {
    setEditingEntry(entry);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingEntry(null);
  }

  // ---------------------------------------------------------------------------
  // Bulk action handlers
  // ---------------------------------------------------------------------------

  async function handleBulkDelete() {
    if (!confirm(`Delete ${bulk.selectionCount} entr${bulk.selectionCount === 1 ? "y" : "ies"}? This cannot be undone.`)) return;
    setBulkWorking(true);
    const ids = Array.from(bulk.selectedIds);
    let failed = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
      }),
    );
    setEntries((prev) => prev.filter((e) => !bulk.selectedIds.has(e.id)));
    bulk.deselectAll();
    setBulkWorking(false);
    if (failed > 0) {
      toast.show(`Deleted ${ids.length - failed} entries. ${failed} failed.`, "error");
    } else {
      toast.show(`Deleted ${ids.length} entr${ids.length === 1 ? "y" : "ies"}`, "success");
    }
    void fetchStats();
  }

  async function handleBulkSetActive(isActive: boolean) {
    setBulkWorking(true);
    const ids = Array.from(bulk.selectedIds).filter((id) => {
      const entry = entries.find((e) => e.id === id);
      return entry ? entry.is_active !== isActive : false;
    });
    if (ids.length === 0) {
      setBulkWorking(false);
      return;
    }
    let failed = 0;
    const updated: KnowledgeEntry[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/knowledge/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: isActive }),
          });
          if (!res.ok) {
            failed++;
          } else {
            const data = (await res.json()) as { entry: KnowledgeEntry };
            updated.push(data.entry);
          }
        } catch {
          failed++;
        }
      }),
    );
    setEntries((prev) =>
      prev.map((e) => {
        const u = updated.find((u) => u.id === e.id);
        return u ?? e;
      }),
    );
    bulk.deselectAll();
    setBulkWorking(false);
    const label = isActive ? "activated" : "deactivated";
    if (failed > 0) {
      toast.show(`${ids.length - failed} entries ${label}. ${failed} failed.`, "error");
    } else {
      toast.show(`${ids.length} entr${ids.length === 1 ? "y" : "ies"} ${label}`, "success");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const emptyMessages: Record<FilterTab, { title: string; description: string }> = {
    all: {
      title: "No knowledge entries yet",
      description:
        "Add facts, preferences, procedures, and snippets that the AI uses when drafting replies for you.",
    },
    fact: {
      title: "No facts added yet",
      description: "Facts are things the AI should know about you or your business.",
    },
    preference: {
      title: "No preferences added yet",
      description: "Preferences tell the AI how you like to communicate.",
    },
    procedure: {
      title: "No procedures added yet",
      description: "Procedures are step-by-step instructions the AI should follow.",
    },
    snippet: {
      title: "No snippets added yet",
      description: "Snippets are reply templates the AI can use verbatim or adapt.",
    },
  };

  return (
    <div>
      {/* Stats banner */}
      <StatsBanner stats={stats} />

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tab bar */}
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === key
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              }`}
            >
              {label}
              {key !== "all" && stats && (
                <span className="ml-1.5 text-[10px] text-text-muted">
                  ({stats.byType[key] ?? 0})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right side: search + add */}
        <div className="flex gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search entries..."
              className="w-48 rounded-lg border border-border bg-surface-1 py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-text hover:bg-accent/90"
          >
            <Plus size={15} />
            Add entry
          </button>
        </div>
      </div>

      {/* Bulk toolbar — visible when items are selected */}
      {bulk.selectionCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5">
          <span className="mr-auto text-sm font-medium text-text-primary">
            {bulk.selectionCount} selected
          </span>
          <button
            type="button"
            onClick={() => void handleBulkSetActive(true)}
            disabled={bulkWorking}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-700/40 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 sm:h-9"
          >
            {bulkWorking ? <Loader2 size={14} className="animate-spin" /> : <ToggleRight size={14} />}
            Activate
          </button>
          <button
            type="button"
            onClick={() => void handleBulkSetActive(false)}
            disabled={bulkWorking}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50 sm:h-9"
          >
            {bulkWorking ? <Loader2 size={14} className="animate-spin" /> : <ToggleLeft size={14} />}
            Deactivate
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={bulkWorking}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 sm:h-9"
          >
            {bulkWorking ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
          <button
            type="button"
            onClick={bulk.deselectAll}
            disabled={bulkWorking}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50 sm:h-9"
            aria-label="Clear selection"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Entry list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={emptyMessages[filter].title}
          description={emptyMessages[filter].description}
          action={
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent/90"
            >
              <Plus size={15} />
              Add your first entry
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Select All header row */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-0 px-4 py-2">
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
                : `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
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

          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={openEditModal}
              onDelete={(id) => void handleDelete(id)}
              onToggleActive={(e) => void handleToggleActive(e)}
              toggling={togglingId === entry.id}
              isSelected={bulk.isSelected(entry.id)}
              onToggleSelect={bulk.toggle}
              selectionMode={bulk.selectionCount > 0}
            />
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />
          {/* Panel */}
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-6 shadow-xl animate-slide-up sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">
                {editingEntry ? "Edit entry" : "Add knowledge entry"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <EntryForm
              initial={
                editingEntry
                  ? {
                      type: editingEntry.type,
                      title: editingEntry.title,
                      content: editingEntry.content,
                      scope: editingEntry.scope,
                      scope_value: editingEntry.scope_value ?? "",
                      is_active: editingEntry.is_active,
                    }
                  : EMPTY_FORM
              }
              onSave={(form) => handleSave(form)}
              onCancel={closeModal}
              saving={saving}
            />
          </div>
        </div>
      )}
    </div>
  );
}
