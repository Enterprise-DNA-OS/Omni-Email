"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail, Send, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { RichTextEditor, htmlToPlainText } from "@/components/RichTextEditor";

type Account = { id: string; provider: string; emailAddress: string };

export function ForwardModal({
  open,
  onClose,
  originalMessage,
}: {
  open: boolean;
  onClose: () => void;
  originalMessage: {
    sender: string | null;
    body_text: string | null;
    body_html: string | null;
    message_at: string;
    subject: string | null;
  };
}) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  const fwdSubject = `Fwd: ${originalMessage.subject ?? "(no subject)"}`;
  const originalBodyHtml = originalMessage.body_html
    ? originalMessage.body_html
    : `<pre>${originalMessage.body_text ?? ""}</pre>`;
  const fwdBodyHtml = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;color:#666"><p><strong>---------- Forwarded message ----------</strong><br>From: ${originalMessage.sender ?? "Unknown"}<br>Date: ${new Date(originalMessage.message_at).toLocaleString()}<br>Subject: ${originalMessage.subject ?? "(no subject)"}</p>${originalBodyHtml}</div>`;

  const [bodyHtml, setBodyHtml] = useState(fwdBodyHtml);

  useEffect(() => {
    if (!open) return;
    setBodyHtml(fwdBodyHtml);
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((j: { accounts?: Account[] }) => {
        const accs = j.accounts ?? [];
        setAccounts(accs);
        if (accs.length > 0 && !accountId) setAccountId(accs[0].id);
      })
      .catch(() => {});
  }, [open, fwdBodyHtml, accountId]);

  // Wait for client mount before rendering portal (SSR safety)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  async function handleSend() {
    if (!accountId || !to.trim()) return;
    setSending(true);
    try {
      const plainText = htmlToPlainText(bodyHtml);
      const res = await fetch("/api/compose/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to,
          subject: fwdSubject,
          bodyText: plainText,
          bodyHtml: bodyHtml || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        toast.show(json.error ?? "Forward failed", "error");
      } else {
        toast.show("Email forwarded!", "success");
        setTo("");
        onClose();
      }
    } catch {
      toast.show("Network error", "error");
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    /* Mobile: bottom-sheet (items-end, no padding, rounded-t-2xl).
       Desktop (md+): centred dialog with p-4 and rounded-2xl.
       This matches the ComposeModal pattern for consistency. */
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex w-full max-h-[90vh] flex-col rounded-t-2xl border border-border bg-surface-1 shadow-lg animate-slide-up md:max-w-2xl md:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Forward Message</h2>
          {/* p-2.5 gives a ~44px touch target for the close button */}
          <button
            type="button"
            aria-label="Close forward dialog"
            onClick={onClose}
            className="rounded-md p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary sm:p-1.5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {/* From — text-base (16px) prevents iOS Safari from auto-zooming on focus */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">From</label>
            <select
              className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-base leading-tight text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.provider} — {a.emailAddress}
                </option>
              ))}
            </select>
          </div>

          {/* To — text-base (16px) prevents iOS Safari from auto-zooming on focus */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">To</label>
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
                className="w-full rounded-lg border border-border bg-surface-0 py-2 pl-9 pr-3 text-base leading-tight text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
              />
            </div>
          </div>

          {/* Subject (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Subject</label>
            <input
              type="text"
              value={fwdSubject}
              readOnly
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-secondary"
            />
          </div>

          {/* Body */}
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            placeholder="Add a message..."
            minRows={8}
          />
        </div>

        {/* Footer — py-2.5 on buttons for min 44px touch height */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 sm:py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending || !to.trim()}
            onClick={handleSend}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50 sm:py-2"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Forward
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
