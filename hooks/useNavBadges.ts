"use client";

import { useEffect, useState, useCallback } from "react";

export interface NavBadges {
  approvalCount: number;
  taskCount: number;
  waitingCount: number;
  snoozedCount: number;
  alertCount: number;
  currentMode: string;
}

const POLL_INTERVAL = 60_000;

export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({
    approvalCount: 0,
    taskCount: 0,
    waitingCount: 0,
    snoozedCount: 0,
    alertCount: 0,
    currentMode: "",
  });

  const fetchAll = useCallback(async (signal: AbortSignal) => {
    const results = await Promise.allSettled([
      fetch("/api/approval-queue/count", { signal }).then((r) =>
        r.ok ? (r.json() as Promise<{ count?: number }>) : null
      ),
      fetch("/api/tasks?status=pending&limit=1", { signal }).then((r) =>
        r.ok ? (r.json() as Promise<{ total?: number }>) : null
      ),
      fetch("/api/follow-ups", { signal }).then((r) =>
        r.ok ? (r.json() as Promise<{ followUps?: unknown[] }>) : null
      ),
      fetch("/api/threads/snoozed", { signal }).then((r) =>
        r.ok ? (r.json() as Promise<{ threads?: unknown[] }>) : null
      ),
      fetch("/api/threads/alerts", { signal }).then((r) =>
        r.ok ? (r.json() as Promise<{ alerts?: unknown[] }>) : null
      ),
      fetch("/api/mode", { signal }).then((r) =>
        r.ok ? (r.json() as Promise<{ mode?: string }>) : null
      ),
    ]);

    const val = <T,>(r: PromiseSettledResult<T | null>): T | null =>
      r.status === "fulfilled" ? r.value : null;

    setBadges({
      approvalCount: val(results[0])?.count ?? 0,
      taskCount: val(results[1])?.total ?? 0,
      waitingCount: (val(results[2])?.followUps ?? []).length,
      snoozedCount: (val(results[3])?.threads ?? []).length,
      alertCount: (val(results[4])?.alerts ?? []).length,
      currentMode: val(results[5])?.mode ?? "",
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAll(controller.signal);
    const interval = setInterval(() => {
      void fetchAll(controller.signal);
    }, POLL_INTERVAL);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchAll]);

  return badges;
}

export function badgeFor(
  label: string,
  badges: NavBadges,
  unreadCount?: number
): number | null {
  if (label === "Inbox")
    return (unreadCount ?? 0) > 0 ? (unreadCount ?? 0) : null;
  if (label === "Approvals")
    return badges.approvalCount > 0 ? badges.approvalCount : null;
  if (label === "Tasks")
    return badges.taskCount > 0 ? badges.taskCount : null;
  if (label === "Waiting On")
    return badges.waitingCount > 0 ? badges.waitingCount : null;
  if (label === "Snoozed")
    return badges.snoozedCount > 0 ? badges.snoozedCount : null;
  if (label === "Alerts")
    return badges.alertCount > 0 ? badges.alertCount : null;
  return null;
}

export function badgeColorFor(label: string): string {
  if (label === "Approvals") return "bg-yellow-500 text-white";
  if (label === "Waiting On") return "bg-orange-500 text-white";
  if (label === "Snoozed") return "bg-amber-500 text-white";
  if (label === "Alerts") return "bg-red-500 text-white";
  return "bg-accent text-accent-text";
}
