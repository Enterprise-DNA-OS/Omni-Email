"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X,
  Send,
  Loader2,
  MessageSquare,
  Check,
  XCircle,
  Bot,
  User,
  ExternalLink,
  Trash2,
  AlarmClock,
  Tag,
  Forward,
  ShieldCheck,
  FileEdit,
  Settings,
  BarChart2,
  Bell,
} from "lucide-react";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  threadRefs?: string[];
  actions?: ChatAction[];
}

interface ChatAction {
  type:
    | "archive"
    | "mark_read"
    | "mark_unread"
    | "star"
    | "delete"
    | "label"
    | "snooze"
    | "tag"
    | "forward"
    | "create_rule"
    | "create_draft"
    | "update_settings"
    | "daily_summary"
    | "set_followup";
  threadId?: string;
  params: Record<string, unknown>;
  description: string;
}

type ActionState = "pending" | "approved" | "cancelled" | "loading";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata: {
    actions?: ChatAction[];
    threadRefs?: string[];
  };
  created_at: string;
}

// ---------------------------------------------------------------------------
// Quick-action prompts shown when history is empty
// ---------------------------------------------------------------------------

const QUICK_PROMPTS: Array<{ label: string; prompt: string; icon: React.ReactNode }> = [
  {
    label: "What needs my attention?",
    prompt: "What emails need my attention today?",
    icon: <BarChart2 size={12} />,
  },
  {
    label: "Summarize today",
    prompt: "Give me a summary of today's inbox",
    icon: <MessageSquare size={12} />,
  },
  {
    label: "Create a rule",
    prompt: "Create a rule to auto-archive newsletters",
    icon: <ShieldCheck size={12} />,
  },
  {
    label: "Draft a reply",
    prompt: "Draft a professional reply to the last email I received",
    icon: <FileEdit size={12} />,
  },
  {
    label: "Snooze unread",
    prompt: "Snooze all unread emails until tomorrow morning",
    icon: <AlarmClock size={12} />,
  },
  {
    label: "Tag by sender",
    prompt: 'Tag all emails from acme.com as "client"',
    icon: <Tag size={12} />,
  },
];

// ---------------------------------------------------------------------------
// Markdown renderer: bold, italic, inline code, links, line breaks
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /\[([^\]]+)\]\((\/[^)]+)\)/g,
      '<a href="$2" class="text-accent underline hover:opacity-80">$1</a>',
    )
    .replace(
      /\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:opacity-80">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs">$1</code>',
    )
    .replace(/\n/g, "<br />");
}

// ---------------------------------------------------------------------------
// Action icons per type
// ---------------------------------------------------------------------------

function actionIcon(type: ChatAction["type"]): React.ReactNode {
  const size = 12;
  switch (type) {
    case "snooze":
      return <AlarmClock size={size} />;
    case "set_followup":
      return <Bell size={size} />;
    case "tag":
    case "label":
      return <Tag size={size} />;
    case "forward":
      return <Forward size={size} />;
    case "create_rule":
      return <ShieldCheck size={size} />;
    case "create_draft":
      return <FileEdit size={size} />;
    case "update_settings":
      return <Settings size={size} />;
    case "daily_summary":
      return <BarChart2 size={size} />;
    case "delete":
      return <Trash2 size={size} />;
    default:
      return <Check size={size} />;
  }
}

function actionLabel(type: ChatAction["type"]): string {
  const map: Record<ChatAction["type"], string> = {
    archive: "Archive thread",
    mark_read: "Mark as read",
    mark_unread: "Mark as unread",
    star: "Star thread",
    delete: "Delete thread",
    label: "Apply label",
    snooze: "Snooze thread",
    tag: "Apply tag",
    forward: "Forward thread",
    create_rule: "Create inbox rule",
    create_draft: "Create draft",
    update_settings: "Update settings",
    daily_summary: "Daily inbox summary",
    set_followup: "Set follow-up reminder",
  };
  return map[type] ?? type;
}

// ---------------------------------------------------------------------------
// Rich detail view for complex action types
// ---------------------------------------------------------------------------

function ActionDetail({ action }: { action: ChatAction }): React.ReactNode {
  if (action.type === "create_rule") {
    const p = action.params as {
      name?: string;
      conditions?: Array<{ field: string; operator: string; value: string; logic: string }>;
      actions?: Array<{ type: string; params: Record<string, unknown> }>;
    };
    return (
      <div className="mt-1.5 space-y-1 rounded-lg bg-surface-0 p-2 text-[11px] text-text-secondary">
        {p.name && (
          <p>
            <span className="font-medium text-text-primary">Rule:</span> {p.name}
          </p>
        )}
        {p.conditions && p.conditions.length > 0 && (
          <p>
            <span className="font-medium text-text-primary">When:</span>{" "}
            {p.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(` ${p.conditions[0].logic} `)}
          </p>
        )}
        {p.actions && p.actions.length > 0 && (
          <p>
            <span className="font-medium text-text-primary">Then:</span>{" "}
            {p.actions.map((a) => a.type).join(", ")}
          </p>
        )}
      </div>
    );
  }

  if (action.type === "create_draft") {
    const p = action.params as { to?: string; subject?: string; bodyText?: string };
    return (
      <div className="mt-1.5 space-y-1 rounded-lg bg-surface-0 p-2 text-[11px] text-text-secondary">
        {p.to && (
          <p>
            <span className="font-medium text-text-primary">To:</span> {p.to}
          </p>
        )}
        {p.subject && (
          <p>
            <span className="font-medium text-text-primary">Subject:</span> {p.subject}
          </p>
        )}
        {p.bodyText && (
          <p className="line-clamp-3 italic text-text-muted">{p.bodyText}</p>
        )}
      </div>
    );
  }

  if (action.type === "snooze" || action.type === "set_followup") {
    const until =
      action.type === "snooze"
        ? (action.params.until as string | undefined)
        : (action.params.snoozeUntil as string | undefined);
    if (until) {
      const d = new Date(until);
      return (
        <p className="mt-1 text-[11px] text-text-muted">
          Until: {isNaN(d.getTime()) ? until : d.toLocaleString()}
        </p>
      );
    }
  }

  if (action.type === "forward") {
    const p = action.params as { toEmail?: string };
    if (p.toEmail) {
      return (
        <p className="mt-1 text-[11px] text-text-muted">To: {p.toEmail}</p>
      );
    }
  }

  if (action.type === "update_settings") {
    const p = action.params as { settingKey?: string; settingValue?: unknown };
    if (p.settingKey) {
      return (
        <p className="mt-1 text-[11px] text-text-muted">
          {p.settingKey}: {String(p.settingValue ?? "")}
        </p>
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Action card — shown inline after assistant messages
// ---------------------------------------------------------------------------

function ActionCard({
  action,
  onApprove,
  onDismiss,
}: {
  action: ChatAction;
  onApprove: (action: ChatAction) => Promise<void>;
  onDismiss: (action: ChatAction) => void;
}) {
  const [state, setState] = useState<ActionState>("pending");

  async function handleApprove() {
    setState("loading");
    try {
      await onApprove(action);
      setState("approved");
    } catch {
      setState("pending");
    }
  }

  function handleDismiss() {
    setState("cancelled");
    onDismiss(action);
  }

  const isDestructive = action.type === "delete";

  return (
    <div
      className={`mt-2 rounded-xl border p-3 ${
        isDestructive
          ? "border-red-300 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20"
          : "border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={`${isDestructive ? "text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-300"}`}
        >
          {actionIcon(action.type)}
        </span>
        <p
          className={`text-xs font-semibold ${
            isDestructive ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
          }`}
        >
          {actionLabel(action.type)}
        </p>
      </div>
      <p
        className={`mb-1 text-xs ${
          isDestructive ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"
        }`}
      >
        {action.description}
      </p>
      <ActionDetail action={action} />
      {state === "pending" && (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleApprove()}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition-colors ${
              isDestructive
                ? "bg-red-500 hover:bg-red-600"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            <Check size={11} />
            Approve
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isDestructive
                ? "border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
                : "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
            }`}
          >
            <XCircle size={11} />
            Cancel
          </button>
        </div>
      )}
      {state === "loading" && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <Loader2 size={11} className="animate-spin" />
          Applying...
        </div>
      )}
      {state === "approved" && (
        <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">
          Action applied
        </p>
      )}
      {state === "cancelled" && (
        <p className="mt-2 text-xs text-text-muted">Action cancelled</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history when panel opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const res = await fetch("/api/chat/history");
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: HistoryMessage[] };
        if (!cancelled) {
          const mapped: ChatMessage[] = (data.messages ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
            threadRefs: m.metadata.threadRefs ?? [],
            actions: m.metadata.actions ?? [],
          }));
          setMessages(mapped);
        }
      } catch {
        // Non-critical — start with empty history
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  async function sendMessage(text?: string) {
    const messageText = (text ?? input).trim();
    if (!messageText || loading) return;

    const tempId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempId,
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!text) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: messageText }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }

      const data = (await res.json()) as {
        response?: string;
        actions?: ChatAction[];
        threadRefs?: string[];
        error?: string;
      };

      if (data.error) throw new Error(data.error);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response ?? "",
        timestamp: new Date().toISOString(),
        threadRefs: data.threadRefs ?? [],
        actions: data.actions ?? [],
      };

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { ...userMsg, id: `user-persisted-${Date.now()}` },
        assistantMsg,
      ]);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed to send message", "error");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  async function clearHistory() {
    if (clearing) return;
    setClearing(true);
    try {
      const res = await fetch("/api/chat/history", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear history");
      setMessages([]);
    } catch {
      toast.show("Could not clear chat history", "error");
    } finally {
      setClearing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Action execution — called when user approves an action card
  // ---------------------------------------------------------------------------

  async function handleActionApprove(action: ChatAction): Promise<void> {
    const threadId = action.threadId ?? "";

    switch (action.type) {
      case "archive": {
        const res = await fetch(`/api/threads/${threadId}/archive`, { method: "POST" });
        if (!res.ok) throw new Error("Archive failed");
        break;
      }

      case "mark_read": {
        const res = await fetch(`/api/threads/${threadId}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        });
        if (!res.ok) throw new Error("Mark read failed");
        break;
      }

      case "mark_unread": {
        const res = await fetch(`/api/threads/${threadId}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: false }),
        });
        if (!res.ok) throw new Error("Mark unread failed");
        break;
      }

      case "snooze": {
        const until = action.params.until as string | undefined;
        if (!until) throw new Error("Missing snooze timestamp");
        const res = await fetch(`/api/threads/${threadId}/snooze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ until }),
        });
        if (!res.ok) throw new Error("Snooze failed");
        break;
      }

      case "set_followup": {
        const snoozeUntil = action.params.snoozeUntil as string | undefined;
        if (!snoozeUntil) throw new Error("Missing follow-up timestamp");
        const res = await fetch(`/api/threads/${threadId}/snooze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ until: snoozeUntil }),
        });
        if (!res.ok) throw new Error("Follow-up reminder failed");
        break;
      }

      case "tag": {
        const tagName = action.params.tagName as string | undefined;
        if (!tagName) throw new Error("Missing tag name");
        // First ensure tag exists (create if needed)
        const tagsRes = await fetch("/api/tags");
        const tagsData = (await tagsRes.json()) as { tags?: Array<{ id: string; name: string }> };
        let tagId = tagsData.tags?.find((t) => t.name.toLowerCase() === tagName.toLowerCase())?.id;
        if (!tagId) {
          const createRes = await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: tagName }),
          });
          if (!createRes.ok) throw new Error("Could not create tag");
          const created = (await createRes.json()) as { tag?: { id: string } };
          tagId = created.tag?.id;
        }
        if (!tagId) throw new Error("Tag ID unavailable");
        const res = await fetch(`/api/threads/${threadId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId }),
        });
        if (!res.ok) throw new Error("Tag application failed");
        break;
      }

      case "label": {
        const label = action.params.label as string | undefined;
        if (label) {
          const tagsRes = await fetch("/api/tags");
          const tagsData = (await tagsRes.json()) as {
            tags?: Array<{ id: string; name: string }>;
          };
          let tagId = tagsData.tags?.find(
            (t) => t.name.toLowerCase() === label.toLowerCase(),
          )?.id;
          if (!tagId) {
            const createRes = await fetch("/api/tags", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: label }),
            });
            const created = (await createRes.json()) as { tag?: { id: string } };
            tagId = created.tag?.id;
          }
          if (tagId) {
            await fetch(`/api/threads/${threadId}/tags`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tagId }),
            });
          }
        }
        break;
      }

      case "forward": {
        const toEmail = action.params.toEmail as string | undefined;
        if (!toEmail) throw new Error("Missing forward recipient");
        // Get the thread to forward
        const threadRes = await fetch(`/api/threads/${threadId}`);
        const threadData = (await threadRes.json()) as {
          thread?: { account_id?: string; subject?: string };
        };
        const subject = `Fwd: ${threadData.thread?.subject ?? ""}`;
        const accountId = threadData.thread?.account_id ?? "";
        const res = await fetch("/api/compose/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            to: toEmail,
            subject,
            bodyText: `[Forwarded from thread ${threadId}]`,
          }),
        });
        if (!res.ok) throw new Error("Forward failed");
        break;
      }

      case "create_rule": {
        const { name, conditions, actions: ruleActions, enabled } = action.params as {
          name?: string;
          conditions?: unknown;
          actions?: unknown;
          enabled?: boolean;
        };
        if (!name) throw new Error("Rule name required");
        const res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            conditions: conditions ?? [],
            actions: ruleActions ?? [],
            enabled: enabled ?? true,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Rule creation failed");
        }
        toast.show(`Rule "${name}" created`, "success");
        break;
      }

      case "create_draft": {
        const { to, subject, bodyText, threadId: draftThreadId } = action.params as {
          to?: string;
          subject?: string;
          bodyText?: string;
          threadId?: string;
        };
        if (!to || !subject || !bodyText) throw new Error("Draft missing required fields");
        // Open compose with pre-filled content — store in sessionStorage for ComposeModal to pick up
        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            "ai_draft",
            JSON.stringify({ to, subject, bodyText, threadId: draftThreadId ?? "" }),
          );
          window.dispatchEvent(new CustomEvent("ai:open_draft"));
        }
        toast.show("Draft ready — compose window opened", "success");
        break;
      }

      case "update_settings": {
        const { settingKey, settingValue } = action.params as {
          settingKey?: string;
          settingValue?: unknown;
        };
        if (!settingKey) throw new Error("Setting key required");
        const res = await fetch("/api/ai/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [settingKey]: settingValue }),
        });
        if (!res.ok) throw new Error("Settings update failed");
        toast.show("Settings updated", "success");
        break;
      }

      case "daily_summary": {
        const res = await fetch("/api/ai/daily-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error("Summary failed");
        const data = (await res.json()) as { summary?: string };
        if (data.summary) {
          const summaryMsg: ChatMessage = {
            id: `summary-${Date.now()}`,
            role: "assistant",
            content: data.summary,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, summaryMsg]);
        }
        break;
      }

      default:
        break;
    }
  }

  function handleActionDismiss(_action: ChatAction) {
    // No server call needed — state managed locally in ActionCard
  }

  if (!open) return null;

  const showEmptyState = !historyLoading && messages.length === 0;

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel — full-width on mobile, 384px sidebar on sm+.
          flex-col with min-h-0 on the messages area prevents iOS layout collapse
          when the virtual keyboard opens and reduces available height. */}
      <aside
        className="fixed bottom-0 right-0 top-0 z-40 flex w-full flex-col border-l border-border bg-surface-1 shadow-xl sm:w-96"
        role="dialog"
        aria-label="Chat with inbox"
      >
        {/* Header — shrink-0 ensures it never compresses when keyboard is open */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
              <MessageSquare size={16} className="text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Chat with Inbox</p>
              <p className="text-[11px] text-text-muted">Ask about your emails</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => void clearHistory()}
                disabled={clearing}
                /* p-2.5 for 44px touch target */
                className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
                aria-label="Clear chat history"
                title="Clear chat"
              >
                {clearing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Messages — min-h-0 is critical: without it, a flex child with
            overflow-y-auto will not shrink when the virtual keyboard reduces
            available height, causing the input area to be pushed off-screen */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {historyLoading && (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="animate-spin text-text-muted" />
            </div>
          )}

          {showEmptyState && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-3 rounded-2xl bg-surface-2 p-4">
                <MessageSquare size={28} className="text-text-muted" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-text-primary">Chat with your inbox</p>
              <p className="mt-1 max-w-[220px] text-xs text-text-muted">
                Ask questions, take actions, or create rules using plain English.
              </p>

              {/* Quick action pills */}
              <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    onClick={() => void sendMessage(qp.prompt)}
                    disabled={loading}
                    /* py-2.5 brings touch target to ~40px for pill buttons */
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-0 px-3 py-2.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:bg-accent-muted hover:text-accent disabled:opacity-50"
                  >
                    {qp.icon}
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions shown above input when there ARE messages */}
          {!showEmptyState && messages.length > 0 && messages.length < 4 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.slice(0, 4).map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => void sendMessage(qp.prompt)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-0 px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:bg-accent-muted hover:text-accent disabled:opacity-50"
                >
                  {qp.icon}
                  {qp.label}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1">
                <div
                  className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {/* Avatar */}
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                      msg.role === "user"
                        ? "bg-accent text-accent-text"
                        : "bg-surface-2 text-text-muted"
                    }`}
                  >
                    {msg.role === "user" ? <User size={13} /> : <Bot size={13} />}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-tr-sm bg-accent text-accent-text"
                        : "rounded-tl-sm bg-surface-2 text-text-primary"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        className="[&_a]:text-accent [&_a]:underline"
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>

                {/* Thread reference links */}
                {msg.role === "assistant" &&
                  msg.threadRefs &&
                  msg.threadRefs.length > 0 && (
                    <div className="ml-9 flex flex-wrap gap-1.5">
                      {msg.threadRefs.map((threadId) => (
                        <Link
                          key={threadId}
                          href={`/thread/${threadId}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-0 px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                        >
                          <ExternalLink size={10} />
                          View thread
                        </Link>
                      ))}
                    </div>
                  )}

                {/* Action cards */}
                {msg.role === "assistant" &&
                  msg.actions &&
                  msg.actions.length > 0 && (
                    <div className="ml-9 space-y-2">
                      {msg.actions.map((action, idx) => (
                        <ActionCard
                          key={`${msg.id}-action-${idx}`}
                          action={action}
                          onApprove={handleActionApprove}
                          onDismiss={handleActionDismiss}
                        />
                      ))}
                    </div>
                  )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted">
                  <Bot size={13} />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5">
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </div>

        {/* Input — shrink-0 so it stays anchored at the bottom when the
            virtual keyboard is open and the flex container shrinks */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your inbox..."
              rows={1}
              disabled={loading}
              /* text-base (16px) prevents iOS Safari auto-zoom on focus */
              className="flex-1 resize-none rounded-xl border border-border bg-surface-0 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 sm:text-sm"
              style={{ maxHeight: "120px", overflowY: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            {/* 44×44 send button — h-11 w-11 = 44px */}
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              aria-label="Send message"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {/* Keyboard hint only meaningful on desktop */}
          <p className="mt-1.5 hidden text-[11px] text-text-muted sm:block">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </aside>
    </>
  );
}
