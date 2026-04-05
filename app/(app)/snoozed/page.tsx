"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, Bell, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

interface SnoozedThread {
  id: string;
  subject: string | null;
  snippet: string | null;
  sender: string | null;
  snoozedUntil: string;
}

function formatWakeUp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SnoozedPage() {
  const toast = useToast();
  const [threads, setThreads] = useState<SnoozedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsnoozingId, setUnsnoozingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/threads/snoozed");
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { threads?: SnoozedThread[] };
        if (!cancelled) setThreads(data.threads ?? []);
      } catch {
        if (!cancelled) toast.show("Failed to load snoozed threads", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUnsnooze(threadId: string) {
    setUnsnoozingId(threadId);
    try {
      const res = await fetch(`/api/threads/${threadId}/snooze`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      toast.show("Thread unsnoozed.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Unsnooze failed", "error");
    } finally {
      setUnsnoozingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-surface-1 px-6 py-4">
        <h1 className="text-lg font-bold text-text-primary">Snoozed</h1>
        <p className="mt-0.5 text-sm text-text-muted">Threads that will return to your inbox later</p>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface-1 p-4">
                <Skeleton className="mb-2 h-4 w-64" />
                <Skeleton className="mb-1 h-3 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={AlarmClock}
              title="No snoozed threads"
              description="Snooze threads to bring them back at the right time."
            />
          </div>
        ) : (
          <ul className="space-y-2 p-6">
            {threads.map((thread) => (
              <li
                key={thread.id}
                className="group flex items-center gap-4 rounded-xl border border-border bg-surface-1 px-4 py-4 shadow-xs transition-shadow hover:shadow-sm"
              >
                <AlarmClock size={18} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/thread/${thread.id}`}
                    className="block truncate text-sm font-medium text-text-primary hover:text-accent"
                  >
                    {thread.subject ?? "(no subject)"}
                  </Link>
                  {thread.sender && (
                    <p className="mt-0.5 truncate text-xs text-text-muted">From: {thread.sender}</p>
                  )}
                  {thread.snippet && (
                    <p className="mt-0.5 truncate text-xs text-text-muted">{thread.snippet}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <Bell size={11} />
                    Wakes up: {formatWakeUp(thread.snoozedUntil)}
                  </span>
                  <button
                    type="button"
                    disabled={unsnoozingId === thread.id}
                    onClick={() => handleUnsnooze(thread.id)}
                    className="text-xs font-medium text-accent opacity-0 transition-opacity hover:underline group-hover:opacity-100 disabled:opacity-50"
                  >
                    {unsnoozingId === thread.id ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 size={11} className="animate-spin" />
                        Unsnoozed...
                      </span>
                    ) : (
                      "Unsnooze now"
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
