"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from "lucide-react";
import { SkeletonCalendarDay } from "@/components/Skeleton";

type Ev = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  account: { provider: string; emailAddress: string } | null;
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  // Default to day view on mobile (< 768px) to avoid 7 stacked full-height cards
  const [view, setView] = useState<"week" | "day">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return "day";
    return "week";
  });

  const range = useMemo(() => {
    const start = new Date(weekStart);
    const end = new Date(start);
    if (view === "week") {
      end.setDate(end.getDate() + 7);
    } else {
      end.setDate(end.getDate() + 1);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }, [weekStart, view]);

  const [syncDone, setSyncDone] = useState(false);

  // Trigger calendar sync once on mount, then reload events
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sync/kick", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSyncDone(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      const p = new URLSearchParams();
      p.set("start", range.start);
      p.set("end", range.end);
      const res = await fetch(`/api/events?${p.toString()}`);
      const json = (await res.json()) as { events?: Ev[] };
      if (cancelled) return;
      setEvents(json.events ?? []);
      setLoading(false);
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, syncDone]);

  const days = useMemo(() => {
    if (view === "day") return [new Date(weekStart)];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [view, weekStart]);

  const dateLabel = useMemo(() => {
    if (view === "day") {
      return weekStart.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${weekStart.toLocaleDateString(undefined, { month: "long", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [view, weekStart]);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 animate-fade-in flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Calendar</h1>
          <p className="mt-1 text-sm text-text-muted">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Navigation — larger touch targets for mobile */}
          <div className="flex items-center overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              aria-label="Previous"
              className="p-3 text-text-secondary transition-colors hover:bg-surface-2"
              onClick={() => {
                setLoading(true);
                const d = new Date(weekStart);
                d.setDate(d.getDate() - (view === "week" ? 7 : 1));
                setWeekStart(view === "week" ? startOfWeek(d) : d);
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="border-x border-border px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2"
              onClick={() => {
                setLoading(true);
                setWeekStart(view === "week" ? startOfWeek(new Date()) : new Date());
              }}
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next"
              className="p-3 text-text-secondary transition-colors hover:bg-surface-2"
              onClick={() => {
                setLoading(true);
                const d = new Date(weekStart);
                d.setDate(d.getDate() + (view === "week" ? 7 : 1));
                setWeekStart(view === "week" ? startOfWeek(d) : d);
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* View toggle — larger hit area on mobile */}
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              className={`rounded-md px-3 py-2.5 text-sm font-medium transition-all sm:py-1.5 ${
                view === "week"
                  ? "bg-surface-1 text-text-primary shadow-xs"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              onClick={() => {
                setLoading(true);
                setView("week");
              }}
            >
              Week
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-2.5 text-sm font-medium transition-all sm:py-1.5 ${
                view === "day"
                  ? "bg-surface-1 text-text-primary shadow-xs"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              onClick={() => {
                setLoading(true);
                setView("day");
              }}
            >
              Day
            </button>
          </div>

          {loading && <Loader2 size={16} className="animate-spin text-text-muted" />}
        </div>
      </div>

      {/* Calendar grid
          Week view: horizontal scroll on mobile (swipe through 7 columns), 7-col grid on md+
          Day view: single full-width column at all breakpoints
      */}
      {loading && events.length === 0 ? (
        <div className={view === "week" ? "overflow-x-auto" : ""}>
          <div className={view === "week" ? "grid min-w-[700px] gap-3 grid-cols-7 md:min-w-0" : "grid gap-3"}>
            {Array.from({ length: view === "week" ? 7 : 1 }).map((_, i) => (
              <SkeletonCalendarDay key={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className={view === "week" ? "overflow-x-auto" : ""}>
          <div className={`grid gap-3 ${view === "week" ? "min-w-[700px] grid-cols-7 md:min-w-0" : "grid-cols-1"}`}>
          {days.map((day) => {
            const key = day.toDateString();
            const today = isToday(day);
            const dayEvents = events.filter((e) => {
              const s = new Date(e.startTime);
              return s.toDateString() === key;
            });
            return (
              <div
                key={key}
                className={`animate-fade-in min-h-44 rounded-xl border bg-surface-1 transition-colors ${
                  today ? "border-accent/40 shadow-sm" : "border-border"
                }`}
              >
                {/* Day header */}
                <div className={`flex items-baseline gap-2 px-3 py-2.5 ${today ? "text-accent" : "text-text-muted"}`}>
                  <span className={`text-lg font-bold ${today ? "text-accent" : "text-text-primary"}`}>
                    {day.getDate()}
                  </span>
                  <span className="text-xs font-medium uppercase">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                </div>

                {/* Events */}
                <ul className="space-y-1.5 px-2 pb-2">
                  {dayEvents.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-lg border-l-[3px] border-accent bg-accent-muted px-2.5 py-2 transition-colors hover:bg-accent-muted"
                    >
                      <div className="text-xs font-semibold text-text-primary">{e.title}</div>
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        {new Date(e.startTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(e.endTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {e.account && (
                        <div className="mt-1 text-[10px] font-medium uppercase text-text-muted">
                          {e.account.provider}
                        </div>
                      )}
                    </li>
                  ))}
                  {dayEvents.length === 0 && (
                    <li className="flex items-center justify-center py-4">
                      <Calendar size={16} className="text-text-muted/40" strokeWidth={1.5} />
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
