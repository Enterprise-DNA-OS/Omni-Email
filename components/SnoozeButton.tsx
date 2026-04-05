"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface SnoozeButtonProps {
  threadId: string;
  onSnoozed?: () => void;
}

function getPresets(): { label: string; value: string }[] {
  const now = new Date();

  // Later today at 5pm
  const laterToday = new Date(now);
  laterToday.setHours(17, 0, 0, 0);
  if (laterToday <= now) laterToday.setDate(laterToday.getDate() + 1);

  // Tomorrow morning at 9am
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  // Next Monday at 9am
  const nextMonday = new Date(now);
  const day = nextMonday.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);

  return [
    { label: "Later today (5pm)", value: laterToday.toISOString() },
    { label: "Tomorrow morning (9am)", value: tomorrow.toISOString() },
    { label: "Next week (Monday 9am)", value: nextMonday.toISOString() },
  ];
}

export function SnoozeButton({ threadId, onSnoozed }: SnoozeButtonProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [busy, setBusy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function snooze(until: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ until }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      toast.show("Thread snoozed.", "success");
      setOpen(false);
      setShowCustom(false);
      onSnoozed?.();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Snooze failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const presets = getPresets();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setOpen((v) => !v);
          setShowCustom(false);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
        Snooze
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => snooze(p.value)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <Clock size={14} className="shrink-0 text-text-muted" />
              {p.label}
            </button>
          ))}

          <div className="my-1 border-t border-border-muted" />

          {!showCustom ? (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <Clock size={14} className="shrink-0 text-text-muted" />
              Custom...
            </button>
          ) : (
            <div className="px-4 py-2.5">
              <label className="mb-1.5 block text-xs font-medium text-text-muted">Wake up at</label>
              <input
                type="datetime-local"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                disabled={!customValue}
                onClick={() => {
                  if (customValue) snooze(new Date(customValue).toISOString());
                }}
                className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Snooze
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
