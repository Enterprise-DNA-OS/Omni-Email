"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface RunInboxStatus {
  active: boolean;
  until?: string | null;
}

function formatUntil(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60_000);

  if (diffMins < 60) return `${diffMins}m`;
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString() === d.toDateString();

  if (today) return timeStr;
  if (tomorrow) return `tomorrow at ${timeStr}`;
  return d.toLocaleDateString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function RunInboxBanner() {
  const toast = useToast();
  const [status, setStatus] = useState<RunInboxStatus | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/run-inbox/status");
        if (!res.ok) return;
        const data = (await res.json()) as RunInboxStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // non-critical
      }
    }

    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleStop() {
    setStopping(true);
    try {
      const res = await fetch("/api/run-inbox/deactivate", { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to stop Run My Inbox", "error");
        return;
      }
      setStatus({ active: false });
      toast.show("Run My Inbox stopped.", "info");
    } catch {
      toast.show("Failed to stop Run My Inbox", "error");
    } finally {
      setStopping(false);
    }
  }

  if (!status?.active) return null;

  const untilText = status.until ? `until ${formatUntil(status.until)}` : "until further notice";

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 shadow-xs dark:from-amber-900/30 dark:to-yellow-900/20 dark:border-amber-500/30"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/20">
        <Zap size={14} className="text-amber-600 dark:text-amber-400" />
      </div>
      <p className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-200">
        AI is running your inbox{" "}
        <span className="font-semibold">{untilText}</span>
      </p>
      <Link
        href="/settings#activity-log"
        className="shrink-0 text-xs font-semibold text-amber-700 underline underline-offset-2 transition-colors hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
      >
        View Actions
      </Link>
      <button
        type="button"
        onClick={handleStop}
        disabled={stopping}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-800/40"
      >
        {stopping ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
        Stop
      </button>
    </div>
  );
}
