"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  Star,
  Shield,
  Ban,
  BellOff,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

type Classification = "vip" | "safe" | "blocked" | "never_auto_send";

interface SenderClassification {
  id: string;
  emailOrDomain: string;
  classification: Classification;
  notes: string | null;
  createdAt: string;
}

const TABS: { key: Classification; label: string; icon: typeof Star }[] = [
  { key: "vip", label: "VIP", icon: Star },
  { key: "safe", label: "Safe", icon: Shield },
  { key: "blocked", label: "Blocked", icon: Ban },
  { key: "never_auto_send", label: "Never Auto-Send", icon: BellOff },
];

const TAB_STYLES: Record<Classification, string> = {
  vip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  safe: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  never_auto_send: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SenderClassifications() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Classification>("vip");
  const [items, setItems] = useState<SenderClassification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form state
  const [newEmail, setNewEmail] = useState("");
  const [newClassification, setNewClassification] = useState<Classification>("vip");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchItems = useCallback(async (classification: Classification) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sender-classifications?classification=${classification}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as {
        items?: SenderClassification[];
        error?: string;
      };
      setItems(data.items ?? []);
    } catch {
      toast.show("Failed to load sender list", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchItems(activeTab);
  }, [activeTab, fetchItems]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/sender-classifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrDomain: newEmail.trim(),
          classification: newClassification,
          notes: newNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to add", "error");
        return;
      }
      toast.show("Sender added.", "success");
      setNewEmail("");
      setNewNotes("");
      if (newClassification === activeTab) {
        await fetchItems(activeTab);
      } else {
        setActiveTab(newClassification);
      }
    } catch {
      toast.show("Failed to add sender", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sender-classifications/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.show("Failed to delete", "error");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.show("Removed.", "info");
    } catch {
      toast.show("Failed to delete", "error");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = items.filter(
    (item) =>
      !search ||
      item.emailOrDomain.toLowerCase().includes(search.toLowerCase()) ||
      (item.notes?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-0 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === key
                ? "bg-surface-1 text-text-primary shadow-xs"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-0 p-4"
      >
        <div className="relative min-w-44 flex-1">
          <input
            type="text"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@example.com or @domain.com"
            className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-3 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="relative">
          <select
            value={newClassification}
            onChange={(e) => setNewClassification(e.target.value as Classification)}
            className="appearance-none rounded-lg border border-border bg-surface-1 py-2 pl-3 pr-8 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {TABS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="min-w-32 flex-1 rounded-lg border border-border bg-surface-1 py-2 pl-3 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={adding || !newEmail.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </form>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${TABS.find((t) => t.key === activeTab)?.label ?? ""} list...`}
          className="w-full rounded-lg border border-border bg-surface-0 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        {loading ? (
          <div className="divide-y divide-border-muted">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="ml-auto h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={TABS.find((t) => t.key === activeTab)?.icon ?? Shield}
            title={`No ${TABS.find((t) => t.key === activeTab)?.label ?? ""} senders`}
            description="Add email addresses or domains using the form above."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                  Email / Domain
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                  Classification
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-muted sm:table-cell">
                  Notes
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-muted md:table-cell">
                  Added
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="group transition-colors hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-mono text-xs text-text-primary">
                    {item.emailOrDomain}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TAB_STYLES[item.classification]}`}
                    >
                      {TABS.find((t) => t.key === item.classification)?.label ?? item.classification}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-text-muted sm:table-cell">
                    {item.notes ?? <span className="opacity-40">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-text-muted md:table-cell">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item.id)}
                      className="rounded-md p-1.5 text-text-muted opacity-0 transition-all hover:bg-danger-muted hover:text-danger group-hover:opacity-100 disabled:opacity-40"
                      title="Remove"
                    >
                      {deletingId === item.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
