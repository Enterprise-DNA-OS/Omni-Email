"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UserPlus,
  Mail,
  Globe,
  RefreshCw,
  Trash2,
  Tag,
  Plus,
  X,
  Loader2,
  LinkIcon,
  ClipboardList,
  Shield,
  ToggleLeft,
  ToggleRight,
  Layers,
  Send,
  PenLine,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { AuditLogViewer } from "@/components/AuditLogViewer";
import { SenderClassifications } from "@/components/SenderClassifications";
import { ModeSelector } from "@/components/ModeSelector";
import { AutoSendConfig } from "@/components/AutoSendConfig";
import { RunInboxModal } from "@/components/RunInboxModal";

type Account = {
  id: string;
  provider: string;
  emailAddress: string;
  status: string;
  autoArchive?: boolean;
};

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tagName, setTagName] = useState("");
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingAutoArchive, setTogglingAutoArchive] = useState<string | null>(null);
  const [analyzingAccountId, setAnalyzingAccountId] = useState<string | null>(null);
  const [runInboxOpen, setRunInboxOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<string>("default");
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const [a, t, m] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/tags"),
        fetch("/api/mode"),
      ]);
      const aj = (await a.json().catch(() => ({}))) as { accounts?: Account[] };
      const tj = (await t.json().catch(() => ({}))) as { tags?: { id: string; name: string }[] };
      const mj = (await m.json().catch(() => ({}))) as { mode?: string };
      setAccounts(aj.accounts ?? []);
      setTags(tj.tags ?? []);
      setCurrentMode(mj.mode ?? "default");
    } catch {
      // Silently handle network/parse failures on initial load
    }
  }, []);

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      toast.show("Account connected successfully!", "success");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("oauth_error")) {
      toast.show(`OAuth error: ${params.get("oauth_error")}`, "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  async function connect(provider: "gmail" | "outlook") {
    setBusy(true);
    const res = await fetch("/api/accounts/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const json = (await res.json()) as { authorizationUrl?: string; error?: string };
    setBusy(false);
    if (json.authorizationUrl) {
      window.location.href = json.authorizationUrl;
      return;
    }
    toast.show(json.error ?? "Connect failed", "error");
  }

  async function syncNow() {
    setSyncing(true);
    await fetch("/api/sync/kick", { method: "POST" });
    setSyncing(false);
    toast.show("Sync requested — emails will arrive shortly.", "success");
  }

  async function forceResync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/force", { method: "POST" });
      const json = (await res.json()) as { synced?: string[]; errors?: { id: string; message: string }[]; sendersFixed?: number };
      if (json.errors && json.errors.length > 0) {
        toast.show(`Re-synced ${json.synced?.length ?? 0} accounts, ${json.errors.length} failed`, "error");
      } else {
        toast.show(`Full re-sync complete — ${json.synced?.length ?? 0} accounts refreshed`, "success");
      }
    } catch {
      toast.show("Force re-sync failed", "error");
    }
    setSyncing(false);
  }

  async function toggleAutoArchive(accountId: string, current: boolean) {
    setTogglingAutoArchive(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoArchive: !current }),
      });
      if (!res.ok) {
        toast.show("Failed to update auto-archive setting", "error");
        return;
      }
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId ? { ...a, autoArchive: !current } : a,
        ),
      );
      toast.show(
        !current ? "Auto-archive enabled." : "Auto-archive disabled.",
        "success",
      );
    } catch {
      toast.show("Failed to update setting", "error");
    } finally {
      setTogglingAutoArchive(null);
    }
  }

  async function analyzeStyle(accountId: string) {
    setAnalyzingAccountId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/analyze-style`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Style analysis failed", "error");
        return;
      }
      toast.show("Writing style analyzed and saved.", "success");
    } catch {
      toast.show("Style analysis failed", "error");
    } finally {
      setAnalyzingAccountId(null);
    }
  }

  function statusBadge(status: string) {
    if (status === "connected" || status === "valid") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Active
        </span>
      );
    }
    if (status === "expired" || status === "invalid") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-muted px-2.5 py-0.5 text-xs font-medium text-danger">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          {status === "expired" ? "Expired" : "Invalid"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-muted px-2.5 py-0.5 text-xs font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        {status}
      </span>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 lg:p-8">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage your connected email accounts and organize with tags.
        </p>
      </div>

      {/* Accounts Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
              <LinkIcon size={16} className="text-accent" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">Connected Accounts</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
              onClick={syncNow}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              Sync now
            </button>
            <button
              type="button"
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-danger/20 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger-muted disabled:opacity-50"
              onClick={forceResync}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              Force full re-sync
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
              onClick={() => connect("gmail")}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              Connect Gmail
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
              onClick={() => connect("outlook")}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
              Connect Outlook
            </button>
          </div>

          {accounts.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No accounts connected"
              description="Connect your Gmail or Outlook account to start syncing emails."
            />
          ) : (
            <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    {a.provider === "gmail" ? (
                      <Mail size={16} className="text-text-muted" />
                    ) : (
                      <Globe size={16} className="text-text-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {a.emailAddress}
                    </p>
                    <p className="text-xs capitalize text-text-muted">{a.provider}</p>
                  </div>
                  {statusBadge(a.status)}
                  <button
                    type="button"
                    disabled={togglingAutoArchive === a.id}
                    onClick={() => toggleAutoArchive(a.id, a.autoArchive ?? false)}
                    title={a.autoArchive ? "Disable auto-archive" : "Enable auto-archive"}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                      a.autoArchive
                        ? "bg-accent-muted text-accent"
                        : "bg-surface-2 text-text-muted hover:bg-surface-3"
                    }`}
                  >
                    {togglingAutoArchive === a.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : a.autoArchive ? (
                      <ToggleRight size={11} />
                    ) : (
                      <ToggleLeft size={11} />
                    )}
                    Auto-archive
                  </button>
                  <button
                    type="button"
                    className="ml-2 rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger"
                    title="Remove account"
                    onClick={async () => {
                      await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
                      toast.show("Account removed.", "info");
                      void refresh();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Tags Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <Tag size={16} className="text-accent" />
          </div>
          <h2 className="text-sm font-semibold text-text-primary">Tags</h2>
        </div>

        <div className="p-6">
          <form
            className="mb-5 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tagName.trim()) return;
              await fetch("/api/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: tagName.trim() }),
              });
              setTagName("");
              toast.show(`Tag "${tagName.trim()}" created.`, "success");
              void refresh();
            }}
          >
            <div className="relative flex-1">
              <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="w-full rounded-lg border border-border bg-surface-0 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="New tag name..."
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Plus size={16} />
              Add
            </button>
          </form>

          {tags.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No tags yet"
              description="Create tags to organize and filter your email threads."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t.id}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-text-secondary transition-colors"
                >
                  {t.name}
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-text-muted opacity-60 transition-all hover:bg-danger-muted hover:text-danger hover:opacity-100"
                    onClick={async () => {
                      await fetch(`/api/tags/${t.id}`, { method: "DELETE" });
                      toast.show(`Tag "${t.name}" removed.`, "info");
                      void refresh();
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
      {/* Sender Lists Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <Shield size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Sender Lists</h2>
            <p className="text-xs text-text-muted">
              Manage VIP senders, safe lists, blocked addresses, and auto-send exceptions.
            </p>
          </div>
        </div>
        <div className="p-6">
          <SenderClassifications />
        </div>
      </section>

      {/* Operating Mode Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "100ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <Layers size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Operating Mode</h2>
            <p className="text-xs text-text-muted">
              Choose how the AI behaves across your inbox.
            </p>
          </div>
        </div>
        <div className="p-6">
          <ModeSelector initialMode={currentMode as Parameters<typeof ModeSelector>[0]["initialMode"]} />
        </div>
      </section>

      {/* Auto-Send Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "110ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <Send size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Auto-Send</h2>
            <p className="text-xs text-text-muted">
              Control when the AI can send emails automatically on your behalf.
            </p>
          </div>
        </div>
        <div className="p-6">
          <AutoSendConfig />
        </div>
      </section>

      {/* Writing Style Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <PenLine size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Writing Style</h2>
            <p className="text-xs text-text-muted">
              Analyze your sent mail to help AI match your tone in draft replies.
            </p>
          </div>
        </div>
        <div className="p-6">
          {accounts.length === 0 ? (
            <EmptyState
              icon={PenLine}
              title="No accounts connected"
              description="Connect an account to analyze your writing style."
            />
          ) : (
            <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {a.emailAddress}
                    </p>
                    <p className="text-xs capitalize text-text-muted">{a.provider}</p>
                  </div>
                  <button
                    type="button"
                    disabled={analyzingAccountId === a.id}
                    onClick={() => analyzeStyle(a.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    {analyzingAccountId === a.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <PenLine size={14} />
                    )}
                    {analyzingAccountId === a.id ? "Analyzing..." : "Analyze"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Run My Inbox Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "130ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <Zap size={16} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Run My Inbox</h2>
            <p className="text-xs text-text-muted">
              Let AI autonomously manage your inbox for a set period. All actions are logged and reversible.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between p-6">
          <p className="max-w-md text-sm text-text-secondary">
            AI will read, prioritise, archive, and reply to emails autonomously — respecting your emergency senders list and confidence threshold.
          </p>
          <button
            type="button"
            onClick={() => setRunInboxOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            <Zap size={15} />
            Activate
          </button>
        </div>
      </section>

      {/* Activity Log Card */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <ClipboardList size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Activity Log</h2>
            <p className="text-xs text-text-muted">A record of actions taken by you, the system, and automation rules.</p>
          </div>
        </div>

        <div className="p-6">
          <AuditLogViewer />
        </div>
      </section>

      <RunInboxModal
        open={runInboxOpen}
        onClose={() => setRunInboxOpen(false)}
        onActivated={() => setRunInboxOpen(false)}
      />
    </div>
  );
}
