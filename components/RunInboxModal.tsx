"use client";

import { useState } from "react";
import { Zap, Plus, X, AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

type Duration = "2h" | "today" | "weekend" | "custom";

interface RunInboxModalProps {
  open: boolean;
  onClose: () => void;
  onActivated?: () => void;
}

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "2h", label: "2 hours" },
  { value: "today", label: "Rest of today" },
  { value: "weekend", label: "This weekend" },
  { value: "custom", label: "Custom..." },
];

function computeUntil(duration: Duration, customDatetime: string): string | null {
  const now = new Date();
  if (duration === "2h") {
    return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  }
  if (duration === "today") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  if (duration === "weekend") {
    const end = new Date(now);
    const day = end.getDay(); // 0=Sun, 6=Sat
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    end.setDate(end.getDate() + daysUntilSunday);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  if (duration === "custom" && customDatetime) {
    return new Date(customDatetime).toISOString();
  }
  return null;
}

export function RunInboxModal({ open, onClose, onActivated }: RunInboxModalProps) {
  const toast = useToast();
  const [duration, setDuration] = useState<Duration>("2h");
  const [customDatetime, setCustomDatetime] = useState("");
  const [emergencyInput, setEmergencyInput] = useState("");
  const [emergencySenders, setEmergencySenders] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(0.7);
  const [activating, setActivating] = useState(false);

  function addEmergencySender() {
    const email = emergencyInput.trim().toLowerCase();
    if (!email) return;
    if (emergencySenders.includes(email)) {
      setEmergencyInput("");
      return;
    }
    setEmergencySenders((prev) => [...prev, email]);
    setEmergencyInput("");
  }

  function removeEmergencySender(email: string) {
    setEmergencySenders((prev) => prev.filter((e) => e !== email));
  }

  async function handleActivate() {
    const until = computeUntil(duration, customDatetime);
    if (!until) {
      toast.show("Please select a valid end time.", "error");
      return;
    }

    setActivating(true);
    try {
      const res = await fetch("/api/run-inbox/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          until,
          emergencySenders,
          confidenceThreshold: threshold,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to activate Run My Inbox", "error");
        return;
      }
      toast.show("Run My Inbox activated. AI is now handling your inbox.", "success");
      onActivated?.();
      onClose();
    } catch {
      toast.show("Failed to activate Run My Inbox", "error");
    } finally {
      setActivating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Run My Inbox" size="md">
      <div className="space-y-6">
        {/* Warning banner */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50 px-4 py-3 dark:bg-amber-900/20 dark:border-amber-500/30">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            AI will handle your inbox autonomously. All actions are logged and reversible.
          </p>
        </div>

        {/* Duration picker */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Duration
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuration(opt.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  duration === opt.value
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border bg-surface-0 text-text-secondary hover:bg-surface-2"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {duration === "custom" && (
            <input
              type="datetime-local"
              value={customDatetime}
              onChange={(e) => setCustomDatetime(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          )}
        </div>

        {/* Emergency senders */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Emergency Senders (always pass through)
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={emergencyInput}
              onChange={(e) => setEmergencyInput(e.target.value)}
              placeholder="boss@company.com"
              className="flex-1 rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmergencySender();
                }
              }}
            />
            <button
              type="button"
              onClick={addEmergencySender}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
            >
              <Plus size={15} />
              Add
            </button>
          </div>
          {emergencySenders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {emergencySenders.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-secondary"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmergencySender(email)}
                    className="rounded-full p-0.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger"
                    aria-label={`Remove ${email}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Confidence threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Confidence Threshold
            </label>
            <span className="text-sm font-semibold text-accent">
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>50% — More actions</span>
            <span>100% — Fewer actions</span>
          </div>
          <p className="text-xs text-text-muted">
            AI only acts when its confidence exceeds this threshold. Higher values mean fewer but more certain actions.
          </p>
        </div>

        {/* Activate */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={activating || (duration === "custom" && !customDatetime)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {activating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Zap size={15} />
            )}
            {activating ? "Activating..." : "Activate"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
