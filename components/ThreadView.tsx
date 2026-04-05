"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  Trash2,
  Tag,
  Plus,
  X,
  Send,
  MessageSquare,
  Loader2,
  MailOpen,
  Forward,
  Paperclip,
  Download,
  ChevronDown,
  Brain,
  BellOff,
  Clock,
  Newspaper,
  ShieldAlert,
  Star,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { AIPanel } from "@/components/AIPanel";
import { ForwardModal } from "@/components/ForwardModal";
import { AIFeedback } from "@/components/AIFeedback";
import { AttachmentChip } from "@/components/AttachmentChip";
import { labelDisplay } from "@/lib/email/labels";
import { RichTextEditor, htmlToPlainText } from "@/components/RichTextEditor";
import { SnoozeButton } from "@/components/SnoozeButton";
import { QuickRuleMenu } from "@/components/QuickRuleMenu";

type Account = { id: string; provider: string; emailAddress: string };

type AttachmentMeta = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
};

type Msg = {
  id: string;
  sender: string | null;
  body_html: string | null;
  body_text: string | null;
  message_at: string;
  labels?: string[];
  attachments?: AttachmentMeta[];
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type TagType = { id: string; name: string };

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-600",
  "bg-rose-100 text-rose-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-cyan-100 text-cyan-600",
  "bg-violet-100 text-violet-600",
];

function avatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type IntentConfig = { label: string; pillClass: string; barColor: string };

const INTENT_CONFIG: Record<string, IntentConfig> = {
  reply: { label: "Reply needed", pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", barColor: "bg-blue-500" },
  reply_urgent: { label: "Urgent reply", pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", barColor: "bg-blue-500" },
  archive: { label: "Archive", pillClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", barColor: "bg-gray-400" },
  delete: { label: "Delete", pillClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", barColor: "bg-red-500" },
  delegate: { label: "Delegate", pillClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", barColor: "bg-orange-500" },
  schedule: { label: "Schedule", pillClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", barColor: "bg-purple-500" },
  review: { label: "Review", pillClass: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", barColor: "bg-yellow-500" },
  ignore: { label: "Ignore", pillClass: "bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-500", barColor: "bg-gray-300" },
  unsubscribe: { label: "Unsubscribe", pillClass: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", barColor: "bg-pink-500" },
  follow_up: { label: "Follow up", pillClass: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", barColor: "bg-teal-500" },
  pay: { label: "Payment", pillClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", barColor: "bg-green-500" },
};

function senderInitial(sender: string | null): string {
  if (!sender) return "?";
  const clean = sender.replace(/<.*>/, "").trim();
  return clean.charAt(0).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AiSignal = {
  signal: "risk" | "opportunity";
  severity: "high" | "medium" | "low";
  reason: string | null;
};

export function ThreadView(props: {
  threadId: string;
  subject: string | null;
  primaryAccountId?: string | null;
  aiIntent?: string | null;
  aiConfidence?: number | null;
  aiReasoning?: string | null;
  aiCategory?: string | null;
  senderEmail?: string | null;
  senderDomain?: string | null;
  isNewsletter?: boolean | null;
  listUnsubscribe?: string | null;
  followUp?: { daysWaiting: number } | null;
  aiSignals?: AiSignal[];
  messages: Msg[];
  tags: TagType[];
  allTags: TagType[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [bodyHtml, setBodyHtml] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Msg | null>(null);
  const [threadTags, setThreadTags] = useState(props.tags);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [replyAccountId, setReplyAccountId] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const tagSearchRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const replyBoxRef = useRef<HTMLDivElement>(null);
  const [replyHighlight, setReplyHighlight] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = `reply-draft:${props.threadId}`;

  /** 25 MB */
  const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

  // Fetch accounts for reply selector; default to the account the thread came in on
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((j: { accounts?: Account[] }) => {
        const accs = (j.accounts ?? []).filter((a) => a.provider && a.emailAddress);
        setAccounts(accs);
        if (accs.length > 0 && !replyAccountId) {
          // Prefer the account the thread arrived on, fall back to first account
          const preferred = props.primaryAccountId
            ? accs.find((a) => a.id === props.primaryAccountId)
            : null;
          setReplyAccountId(preferred ? preferred.id : accs[0].id);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close tag dropdown on outside click
  useEffect(() => {
    if (!tagDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
        setTagSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tagDropdownOpen]);

  // Restore draft from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved) as { bodyHtml: string; accountId?: string };
        if (draft.bodyHtml) setBodyHtml(draft.bodyHtml);
        if (draft.accountId) setReplyAccountId(draft.accountId);
      }
    } catch { /* ignore */ }
  }, [draftKey]);

  // Auto-save draft (debounced)
  const saveDraft = useCallback(
    (html: string, accId: string) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        try {
          if (html.trim()) {
            localStorage.setItem(draftKey, JSON.stringify({ bodyHtml: html, accountId: accId }));
          } else {
            localStorage.removeItem(draftKey);
          }
        } catch { /* quota */ }
      }, 500);
    },
    [draftKey],
  );

  const handleBodyChange = useCallback(
    (html: string) => {
      setBodyHtml(html);
      saveDraft(html, replyAccountId);
    },
    [saveDraft, replyAccountId],
  );

  function clearDraft() {
    localStorage.removeItem(draftKey);
  }

  const sorted = useMemo(
    () => [...props.messages].sort((a, b) => a.message_at.localeCompare(b.message_at)),
    [props.messages],
  );

  function addReplyFiles(incoming: FileList | File[]) {
    const next = [...replyAttachments];
    let totalBytes = next.reduce((s, f) => s + f.size, 0);
    for (const file of Array.from(incoming)) {
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        toast.show("Total attachment size would exceed 25 MB limit", "error");
        break;
      }
      totalBytes += file.size;
      next.push(file);
    }
    setReplyAttachments(next);
  }

  function removeReplyAttachment(index: number) {
    setReplyAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleReplyFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addReplyFiles(e.target.files);
      e.target.value = "";
    }
  }

  function handleReplyDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleReplyDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleReplyDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      addReplyFiles(e.dataTransfer.files);
    }
  }

  async function postJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? res.statusText);
    }
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  async function callUndo(auditLogId: string): Promise<void> {
    const res = await fetch(`/api/audit-log/${auditLogId}/undo`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.show(j.error ?? "Undo failed", "error");
    } else {
      toast.show("Action undone.", "success");
    }
  }

  const availableTags = props.allTags.filter((t) => !threadTags.some((x) => x.id === t.id));

  // p-4 on mobile (≥320px), p-6 on sm+, p-8 on lg+
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="animate-fade-in space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={15} />
            Back to Inbox
          </Link>
          {/* Action buttons: wrap on mobile, single row on md+.
              Show icon-only on xs (<sm) to prevent overflow. */}
          <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
          <QuickRuleMenu
            threadId={props.threadId}
            senderEmail={props.senderEmail ?? null}
            senderDomain={props.senderDomain ?? null}
            subject={props.subject}
            aiCategory={props.aiCategory ?? null}
          />
          <SnoozeButton
            threadId={props.threadId}
            onSnoozed={() => router.push("/inbox")}
          />
          {/* Archive — icon-only on mobile (<sm), icon+label on sm+ */}
          <button
            type="button"
            title="Archive"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50 sm:px-3 sm:py-2"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("archive");
              try {
                const result = await postJson(`/api/threads/${props.threadId}/archive`, { method: "POST" });
                const auditLogId = typeof result.auditLogId === "string" ? result.auditLogId : null;
                toast.show(
                  "Thread archived.",
                  "undo",
                  auditLogId
                    ? { label: "Undo", onClick: () => callUndo(auditLogId) }
                    : undefined,
                );
                router.push("/inbox");
              } catch (e) {
                toast.show(e instanceof Error ? e.message : "Archive failed", "error");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "archive" ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
            <span className="hidden sm:inline">Archive</span>
          </button>
          {/* Mark unread — icon-only on mobile */}
          <button
            type="button"
            title="Mark unread"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50 sm:px-3 sm:py-2"
            disabled={busy !== null}
            onClick={async () => {
              await fetch(`/api/threads/${props.threadId}/read`, { method: "DELETE" });
              toast.show("Marked as unread.", "info");
              router.push("/inbox");
            }}
          >
            <MailOpen size={15} />
            <span className="hidden sm:inline">Mark unread</span>
          </button>
          {(props.isNewsletter || props.listUnsubscribe) && !unsubscribed && (
            /* Unsubscribe — icon-only on mobile */
            <button
              type="button"
              title="Unsubscribe"
              className="inline-flex items-center gap-2 rounded-lg border border-pink-300/60 px-2.5 py-2.5 text-sm font-medium text-pink-700 transition-colors hover:bg-pink-50 disabled:opacity-50 dark:border-pink-800/40 dark:text-pink-400 dark:hover:bg-pink-900/20 sm:px-3 sm:py-2"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("unsubscribe");
                try {
                  await fetch(`/api/threads/${props.threadId}/unsubscribe`, { method: "POST" });
                  setUnsubscribed(true);
                  toast.show("Unsubscribed from this sender.", "success");
                } catch {
                  toast.show("Unsubscribe failed.", "error");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "unsubscribe" ? <Loader2 size={15} className="animate-spin" /> : <BellOff size={15} />}
              <span className="hidden sm:inline">Unsubscribe</span>
            </button>
          )}
          {unsubscribed && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2.5 text-sm text-text-muted sm:px-3 sm:py-2">
              <BellOff size={14} />
              <span className="hidden sm:inline">Unsubscribed</span>
            </span>
          )}
          {/* Delete — icon-only on mobile */}
          <button
            type="button"
            title="Delete thread"
            className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-2.5 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger-muted disabled:opacity-50 sm:px-3 sm:py-2"
            disabled={busy !== null}
            onClick={async () => {
              if (!confirm("Delete this thread locally and in mailbox?")) return;
              setBusy("delete");
              try {
                const result = await postJson(`/api/threads/${props.threadId}`, { method: "DELETE" });
                const auditLogId = typeof result.auditLogId === "string" ? result.auditLogId : null;
                toast.show(
                  "Thread deleted.",
                  "undo",
                  auditLogId
                    ? { label: "Undo", onClick: () => callUndo(auditLogId) }
                    : undefined,
                );
                router.push("/inbox");
              } catch (e) {
                toast.show(e instanceof Error ? e.message : "Delete failed", "error");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "delete" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            <span className="hidden sm:inline">Delete</span>
          </button>
          </div>
        </div>

        {/* Title — full width */}
        <h1 className="break-words text-2xl font-bold text-text-primary">
          {props.subject ?? "(no subject)"}
        </h1>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Newsletter badge */}
          {(props.isNewsletter || props.listUnsubscribe) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-2.5 py-1 text-xs font-semibold text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
              <Newspaper size={11} />
              Newsletter
            </span>
          )}
          {/* Follow-up waiting indicator */}
          {props.followUp && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Clock size={11} />
              Awaiting reply ({props.followUp.daysWaiting}d)
            </span>
          )}
          {/* AI signal badges */}
          {props.aiSignals && props.aiSignals.length > 0 && props.aiSignals.map((sig, i) => (
            <span
              key={i}
              title={sig.reason ?? undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                sig.signal === "risk"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              }`}
            >
              {sig.signal === "risk" ? <ShieldAlert size={11} /> : <Star size={11} />}
              {sig.signal === "risk" ? "Risk" : "Opportunity"} — {sig.severity}
            </span>
          ))}
          {/* AI intent */}
          {props.aiIntent && props.aiIntent !== "no_action" && (() => {
            const ic = INTENT_CONFIG[props.aiIntent] ?? null;
            if (!ic) return null;
            const pct = props.aiConfidence != null ? Math.round(props.aiConfidence * 100) : null;
            return (
              <>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ic.pillClass}`}>
                  <Brain size={11} />
                  {ic.label}
                </span>
                {pct != null && (
                  <span className="inline-flex items-center gap-1.5" title={`AI confidence: ${pct}%`}>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <span className={`block h-full rounded-full ${ic.barColor} opacity-80`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-xs text-text-muted">{pct}%</span>
                  </span>
                )}
              </>
            );
          })()}
          {/* Feedback */}
          {props.aiIntent && props.aiIntent !== "no_action" && (
            <AIFeedback
              threadId={props.threadId}
              feedbackType="classification"
              aiOutput={{ intent: props.aiIntent, confidence: props.aiConfidence ?? null }}
            />
          )}
        </div>
        {/* AI reasoning */}
        {props.aiReasoning && (
          <p className="text-xs italic text-text-muted">{props.aiReasoning}</p>
        )}
      </div>

      {/* Tags */}
      <section className="animate-slide-up rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Tag size={15} />
          Tags
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {threadTags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent-muted px-3 py-1 text-xs font-medium text-accent"
            >
              {t.name}
              <button
                type="button"
                className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
                aria-label={`Remove tag ${t.name}`}
                onClick={async () => {
                  try {
                    await fetch(
                      `/api/threads/${props.threadId}/tags?tagId=${encodeURIComponent(t.id)}`,
                      { method: "DELETE" },
                    );
                    setThreadTags((prev) => prev.filter((tag) => tag.id !== t.id));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}

          {/* Add tag dropdown */}
          {availableTags.length > 0 && (
            <div className="relative" ref={tagDropdownRef}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
                onClick={() => {
                  setTagDropdownOpen((prev) => !prev);
                  setTagSearch("");
                  // Focus the search input after the dropdown renders
                  setTimeout(() => tagSearchRef.current?.focus(), 50);
                }}
              >
                <Plus size={12} />
                Add tag
              </button>

              {tagDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-52 rounded-lg border border-border bg-surface-0 py-1 shadow-md">
                  <div className="px-2 pb-1 pt-1.5">
                    <input
                      ref={tagSearchRef}
                      type="text"
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      placeholder="Search tags…"
                      className="w-full rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setTagDropdownOpen(false);
                          setTagSearch("");
                        }
                      }}
                    />
                  </div>
                  <ul className="max-h-52 overflow-y-auto">
                    {availableTags
                      .filter((t) =>
                        tagSearch.trim() === ""
                          ? true
                          : t.name.toLowerCase().includes(tagSearch.toLowerCase()),
                      )
                      .slice(0, 10)
                      .map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                            onClick={async () => {
                              setTagDropdownOpen(false);
                              setTagSearch("");
                              try {
                                await postJson(`/api/threads/${props.threadId}/tags`, {
                                  method: "POST",
                                  body: JSON.stringify({ tagId: t.id }),
                                });
                                setThreadTags((prev) => [...prev, t]);
                              } catch {
                                toast.show("Failed to add tag", "error");
                              }
                            }}
                          >
                            {t.name}
                          </button>
                        </li>
                      ))}
                    {availableTags.filter((t) =>
                      tagSearch.trim() === ""
                        ? true
                        : t.name.toLowerCase().includes(tagSearch.toLowerCase()),
                    ).length === 0 && (
                      <li className="px-3 py-2 text-xs text-text-muted">No tags found</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {threadTags.length === 0 && availableTags.length === 0 && (
            <span className="text-xs text-text-muted">No tags created yet</span>
          )}
        </div>
      </section>

      {/* AI Assistant */}
      <AIPanel
        threadId={props.threadId}
        draftText={htmlToPlainText(bodyHtml)}
        onInsertReply={(text) => {
          handleBodyChange(text);
          toast.show("Reply inserted below — review and send when ready.", "success");
          // Scroll to reply box and flash it
          setTimeout(() => {
            replyBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            setReplyHighlight(true);
            setTimeout(() => setReplyHighlight(false), 2000);
          }, 100);
        }}
      />

      {/* Messages */}
      {sorted.length === 0 && (
        <div className="animate-fade-in rounded-xl border border-border bg-surface-1 p-8 text-center shadow-xs">
          <p className="text-sm text-text-muted">
            No message content available. The email body may not have synced yet.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-accent hover:underline"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </div>
      )}
      <ul className="space-y-4">
      {sorted.map((m) => {
          const initial = senderInitial(m.sender);
          const colorClass = avatarColor(m.sender ?? m.id);
          return (
            <li
              key={m.id}
              className="group animate-slide-up rounded-xl border border-border bg-surface-1 shadow-xs"
            >
              {/* px-4 on mobile, px-5 on sm+ */}
              <div className="flex items-center gap-3 border-b border-border-muted px-4 py-3 sm:px-5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colorClass}`}
                >
                  {initial}
                </div>
                <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                  {m.sender ?? "Unknown sender"}
                </span>
                {/* Label badges — hidden on mobile to keep header single-line */}
                {(m.labels ?? []).map((l) => labelDisplay(l)).filter(Boolean).length > 0 && (
                  <div className="hidden shrink-0 gap-1 sm:flex">
                    {(m.labels ?? []).map((l) => {
                      const display = labelDisplay(l);
                      if (!display) return null;
                      return (
                        <span key={l} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                          {display}
                        </span>
                      );
                    })}
                  </div>
                )}
                {/* Forward button: always tappable on mobile (min 44px), hover-reveal on desktop */}
                <button
                  type="button"
                  className="ml-auto shrink-0 rounded-md p-2.5 text-text-muted transition-opacity hover:bg-surface-2 hover:text-text-primary focus:opacity-100 group-hover:opacity-100 sm:ml-0 sm:p-1 sm:opacity-0"
                  title="Forward"
                  onClick={() => setForwardMsg(m)}
                >
                  <Forward size={14} />
                </button>
                <span className="shrink-0 text-xs text-text-muted">
                  {formatDate(m.message_at)}
                </span>
              </div>
              {/* px-4 on mobile, px-5 on sm+ */}
              <div className="px-4 py-4 sm:px-5">
                {m.body_html ? (
                  /* overflow-x-auto prevents fixed-width HTML email tables from
                     causing horizontal page scroll on mobile */
                  <div className="overflow-x-auto">
                    <div
                      className="max-w-none text-sm leading-relaxed text-text-secondary [&_a]:text-accent [&_a]:underline [&_img]:max-w-full [&_img]:rounded"
                      dangerouslySetInnerHTML={{ __html: m.body_html }}
                    />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-text-secondary">
                    {m.body_text ?? ""}
                  </pre>
                )}
                {(m.attachments ?? []).length > 0 && (
                  <div className="mt-4 border-t border-border-muted pt-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-muted">
                      <Paperclip size={12} />
                      {m.attachments!.length} attachment{m.attachments!.length > 1 ? "s" : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {m.attachments!.map((att) => (
                        <a
                          key={att.attachmentId}
                          href={`/api/attachments/${m.id}/${att.attachmentId}`}
                          download={att.filename}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-0 px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
                        >
                          <Download size={12} />
                          <span className="max-w-[200px] truncate">{att.filename}</span>
                          <span className="text-text-muted">{formatFileSize(att.size)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Reply */}
      <div
        ref={replyBoxRef}
        className={`animate-slide-up rounded-xl border bg-surface-1 p-5 shadow-xs transition-all duration-500 ${
          replyHighlight
            ? "border-accent ring-2 ring-accent/30"
            : "border-border"
        }`}
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
          <MessageSquare size={15} />
          Reply
        </div>

        {/* Account selector */}
        {accounts.length > 1 && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-text-muted">From</label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-lg border border-border bg-surface-0 py-2 pl-3 pr-8 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={replyAccountId}
                onChange={(e) => {
                  setReplyAccountId(e.target.value);
                  saveDraft(bodyHtml, e.target.value);
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.provider} — {a.emailAddress}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            </div>
          </div>
        )}

        {/* Body with drag-and-drop */}
        <div
          className={`relative mb-3 rounded-lg transition-colors ${isDragOver ? "ring-2 ring-accent ring-offset-1" : ""}`}
          onDragOver={handleReplyDragOver}
          onDragLeave={handleReplyDragLeave}
          onDrop={handleReplyDrop}
        >
          <RichTextEditor
            value={bodyHtml}
            onChange={handleBodyChange}
            placeholder="Write a reply..."
            minRows={5}
          />
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-accent/5">
              <div className="flex flex-col items-center gap-2 text-accent">
                <Paperclip size={20} />
                <span className="text-sm font-medium">Drop files to attach</span>
              </div>
            </div>
          )}
        </div>

        {/* Attachment chips */}
        {replyAttachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {replyAttachments.map((file, i) => (
              <AttachmentChip
                key={`${file.name}-${file.size}-${i}`}
                file={file}
                onRemove={() => removeReplyAttachment(i)}
              />
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={replyFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleReplyFileInputChange}
          aria-hidden
        />

        <div className="flex items-center justify-between">
          {/* Attach button: py-2.5 ensures min ~44px touch height */}
          <button
            type="button"
            onClick={() => replyFileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary sm:py-2"
            title="Attach files"
          >
            <Paperclip size={15} />
            Attach
            {replyAttachments.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                {replyAttachments.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            disabled={busy !== null || !htmlToPlainText(bodyHtml).trim()}
            onClick={async () => {
              setBusy("reply");
              toast.show("Sending reply...", "info");
              try {
                const plainText = htmlToPlainText(bodyHtml);
                let res: Response;

                if (replyAttachments.length > 0) {
                  const form = new FormData();
                  form.append("bodyText", plainText);
                  if (bodyHtml) form.append("bodyHtml", bodyHtml);
                  if (replyAccountId) form.append("accountId", replyAccountId);
                  for (const file of replyAttachments) {
                    form.append("attachments", file);
                  }
                  res = await fetch(`/api/threads/${props.threadId}/reply`, {
                    method: "POST",
                    credentials: "include",
                    body: form,
                  });
                } else {
                  res = await fetch(`/api/threads/${props.threadId}/reply`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      bodyText: plainText,
                      bodyHtml: bodyHtml || undefined,
                      accountId: replyAccountId || undefined,
                    }),
                  });
                }

                if (!res.ok) {
                  const j = (await res.json().catch(() => ({}))) as { error?: string };
                  throw new Error(j.error ?? res.statusText);
                }

                setBodyHtml("");
                setReplyAttachments([]);
                clearDraft();
                toast.show("Reply sent successfully!", "success");
                router.refresh();
              } catch (e) {
                toast.show(
                  e instanceof Error ? e.message : "Failed to send reply. Please try again.",
                  "error",
                );
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "reply" ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send size={15} />
                Send
              </>
            )}
          </button>
        </div>
      </div>

      {/* Forward Modal */}
      <ForwardModal
        open={forwardMsg !== null}
        onClose={() => setForwardMsg(null)}
        originalMessage={{
          sender: forwardMsg?.sender ?? null,
          body_text: forwardMsg?.body_text ?? null,
          body_html: forwardMsg?.body_html ?? null,
          message_at: forwardMsg?.message_at ?? "",
          subject: props.subject,
        }}
      />
    </div>
  );
}
