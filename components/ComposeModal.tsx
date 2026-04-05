"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Minus, Maximize2, Mail, Send, Loader2, ChevronDown, Paperclip } from "lucide-react";
import { useToast } from "@/components/Toast";
import { RichTextEditor, htmlToPlainText } from "@/components/RichTextEditor";
import { AttachmentChip } from "@/components/AttachmentChip";
import { ScheduleButton } from "@/components/ScheduleButton";

type Account = { id: string; provider: string; emailAddress: string };

const COMPOSE_DRAFT_KEY = "compose-draft";
/** 25 MB */
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export function ComposeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save draft (debounced)
  const saveDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        const draft = { accountId, to, cc, bcc, subject, bodyHtml, showCc, showBcc };
        const hasContent = to || subject || bodyHtml;
        if (hasContent) {
          localStorage.setItem(COMPOSE_DRAFT_KEY, JSON.stringify(draft));
        } else {
          localStorage.removeItem(COMPOSE_DRAFT_KEY);
        }
      } catch { /* quota */ }
    }, 500);
  }, [accountId, to, cc, bcc, subject, bodyHtml, showCc, showBcc]);

  // Save draft on every field change
  useEffect(() => {
    if (open) saveDraft();
  }, [open, saveDraft]);

  // Restore draft on open
  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(COMPOSE_DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved) as Record<string, string | boolean>;
        if (d.to) setTo(d.to as string);
        if (d.cc) { setCc(d.cc as string); setShowCc(true); }
        if (d.bcc) { setBcc(d.bcc as string); setShowBcc(true); }
        if (d.subject) setSubject(d.subject as string);
        if (d.bodyHtml) setBodyHtml(d.bodyHtml as string);
        if (d.accountId) setAccountId(d.accountId as string);
        if (d.showCc) setShowCc(true);
        if (d.showBcc) setShowBcc(true);
      }
    } catch { /* ignore */ }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((j: { accounts?: Account[] }) => {
        const accs = (j.accounts ?? []).filter((a) => a.provider && a.emailAddress);
        setAccounts(accs);
        if (accs.length > 0 && !accountId) setAccountId(accs[0].id);
      })
      .catch(() => {});
  }, [open, accountId]);

  // Body scroll lock
  // Wait for client mount before rendering portal (SSR safety)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || minimized) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, minimized]);

  if (!open || !mounted) return null;

  const hasContent = to || subject || htmlToPlainText(bodyHtml).trim();

  function handleClose() {
    if (hasContent || attachments.length > 0) {
      if (!confirm("Discard this draft?")) return;
    }
    reset();
    localStorage.removeItem(COMPOSE_DRAFT_KEY);
    onClose();
  }

  function reset() {
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBodyHtml("");
    setShowCc(false);
    setShowBcc(false);
    setMinimized(false);
    setAttachments([]);
    setIsDragOver(false);
  }

  /** Merge incoming files, deduplicating by name+size, enforcing total size limit */
  function addFiles(incoming: FileList | File[]) {
    const next = [...attachments];
    let totalBytes = next.reduce((s, f) => s + f.size, 0);
    for (const file of Array.from(incoming)) {
      // Skip duplicates
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        toast.show("Total attachment size would exceed 25 MB limit", "error");
        break;
      }
      totalBytes += file.size;
      next.push(file);
    }
    setAttachments(next);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files);
      // Reset so the same file can be re-added after removal
      e.target.value = "";
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }

  async function handleSend() {
    const plainText = htmlToPlainText(bodyHtml);
    if (!accountId || !to.trim() || !subject.trim() || !plainText.trim()) return;
    setSending(true);
    try {
      let res: Response;

      if (attachments.length > 0) {
        const form = new FormData();
        form.append("accountId", accountId);
        form.append("to", to);
        if (cc) form.append("cc", cc);
        if (bcc) form.append("bcc", bcc);
        form.append("subject", subject);
        form.append("bodyText", plainText);
        if (bodyHtml) form.append("bodyHtml", bodyHtml);
        for (const file of attachments) {
          form.append("attachments", file);
        }
        res = await fetch("/api/compose/send", { method: "POST", body: form });
      } else {
        res = await fetch("/api/compose/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            to,
            cc: cc || undefined,
            bcc: bcc || undefined,
            subject,
            bodyText: plainText,
            bodyHtml: bodyHtml || undefined,
          }),
        });
      }

      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        toast.show(json.error ?? "Send failed", "error");
      } else {
        toast.show("Email sent!", "success");
        reset();
        localStorage.removeItem(COMPOSE_DRAFT_KEY);
        onClose();
      }
    } catch {
      toast.show("Network error", "error");
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule(scheduledAt: string) {
    const plainText = htmlToPlainText(bodyHtml);
    if (!accountId || !to.trim() || !subject.trim() || !plainText.trim()) return;
    setScheduling(true);
    try {
      const res = await fetch("/api/compose/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          bodyText: plainText,
          bodyHtml: bodyHtml || undefined,
          scheduledAt,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        toast.show(json.error ?? "Schedule failed", "error");
      } else {
        toast.show("Email scheduled!", "success");
        reset();
        localStorage.removeItem(COMPOSE_DRAFT_KEY);
        onClose();
      }
    } catch {
      toast.show("Network error", "error");
    } finally {
      setScheduling(false);
    }
  }

  // Minimized state: small floating bar
  if (minimized) {
    // bottom position accounts for iOS Safari browser chrome (~85px safe area)
    return createPortal(
      <div
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-1 px-4 py-3 shadow-lg transition-all hover:shadow-xl"
        onClick={() => setMinimized(false)}
      >
        <Mail size={16} className="text-accent" />
        <span className="max-w-[200px] truncate text-sm font-medium text-text-primary">
          {subject || "New Message"}
        </span>
        {attachments.length > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
            {attachments.length}
          </span>
        )}
        <Maximize2 size={14} className="text-text-muted" />
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={handleClose} aria-hidden />
      <div className="relative z-10 flex w-full max-h-[90vh] flex-col rounded-t-2xl border border-border bg-surface-1 shadow-lg animate-slide-up md:max-w-[560px] md:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">New Message</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {/* From — text-base (16px) prevents iOS Safari from auto-zooming on focus */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-text-muted">From</label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-lg border border-border bg-surface-0 py-2 pl-3 pr-8 text-base leading-tight text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
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

          {/* To — text-base (16px) prevents iOS Safari from auto-zooming on focus */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-text-muted">To</label>
              <div className="flex gap-2 text-xs">
                {!showCc && (
                  /* min touch target: px-2 py-2 to reach ~44px */
                  <button type="button" className="px-2 py-2 text-accent hover:underline" onClick={() => setShowCc(true)}>
                    CC
                  </button>
                )}
                {!showBcc && (
                  <button type="button" className="px-2 py-2 text-accent hover:underline" onClick={() => setShowBcc(true)}>
                    BCC
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                /* text-base = 16px stops iOS zoom; visually matched to sm text via leading */
                className="w-full rounded-lg border border-border bg-surface-0 py-2 pl-9 pr-3 text-base leading-tight text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
              />
            </div>
          </div>

          {/* CC — text-base (16px) prevents iOS Safari from auto-zooming on focus */}
          {showCc && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-text-muted">CC</label>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
                className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-base leading-tight text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
              />
            </div>
          )}

          {/* BCC — text-base (16px) prevents iOS Safari from auto-zooming on focus */}
          {showBcc && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-text-muted">BCC</label>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="bcc@example.com"
                className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-base leading-tight text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
              />
            </div>
          )}

          {/* Subject */}
          <div className="mb-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full border-b border-border bg-transparent py-2 text-base font-medium text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Body with drag-and-drop */}
          <div
            className={`relative rounded-lg transition-colors ${isDragOver ? "ring-2 ring-accent ring-offset-1" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message..."
              minRows={8}
            />
            {isDragOver && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-accent/5">
                <div className="flex flex-col items-center gap-2 text-accent">
                  <Paperclip size={24} />
                  <span className="text-sm font-medium">Drop files to attach</span>
                </div>
              </div>
            )}
          </div>

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <AttachmentChip
                  key={`${file.name}-${file.size}-${i}`}
                  file={file}
                  onRemove={() => removeAttachment(i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          aria-hidden
        />

        {/* Footer — px-3 on mobile to give more room for buttons; gap-1.5 on mobile */}
        <div className="flex items-center justify-between border-t border-border px-3 py-3 sm:px-5">
          {/* Attach: py-2.5 ensures ~44px touch height */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary sm:py-2"
            title="Attach files"
          >
            <Paperclip size={15} />
            Attach
            {attachments.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                {attachments.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ScheduleButton
              disabled={scheduling || sending || !to.trim() || !subject.trim() || !htmlToPlainText(bodyHtml).trim()}
              onSchedule={(datetime) => void handleSchedule(datetime)}
            />
            <button
              type="button"
              disabled={sending || scheduling || !to.trim() || !subject.trim() || !htmlToPlainText(bodyHtml).trim()}
              onClick={handleSend}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50 sm:px-5"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
