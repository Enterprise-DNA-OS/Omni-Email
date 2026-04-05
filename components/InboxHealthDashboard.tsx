"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Zap,
  Timer,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Minus,
  Users,
  Send,
  Tag,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

// ---- Types -----------------------------------------------------------------

type PeriodKey = "7d" | "14d" | "30d" | "90d";

type DashboardData = {
  avgResponseTimeMinutes: number;
  automationRatePct: number;
  timeSavedHours: number;
  unreadTrend: "up" | "down" | "stable";
  unreadTrendPct: number;
  volumeByDay: Array<{ label: string; count: number }>;
  automationBreakdown: Array<{ label: string; count: number; color: string }>;
};

type HeatmapData = {
  grid: number[][];
  maxValue: number;
};

type VolumeData = {
  days: Array<{
    date: string;
    received: number;
    sent: number;
    archived: number;
    autoHandled: number;
  }>;
};

type SenderData = {
  senders: Array<{
    email: string;
    name: string;
    domain: string;
    count: number;
    lastSeen: string;
  }>;
  recipients: Array<{ email: string; name: string; count: number }>;
};

type CategoryData = {
  categories: Array<{ name: string; count: number; pct: number }>;
};

type ResponseTimeData = {
  avgMinutes: number;
  medianMinutes: number;
  p95Minutes: number;
  byDay: Array<{ date: string; avgMinutes: number }>;
  bySender: Array<{ email: string; avgMinutes: number; count: number }>;
};

// ---- Helpers ---------------------------------------------------------------

function formatMinutes(mins: number): string {
  if (mins <= 0) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function heatmapColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-surface-3";
  const ratio = value / max;
  if (ratio < 0.2) return "bg-accent/15";
  if (ratio < 0.4) return "bg-accent/30";
  if (ratio < 0.6) return "bg-accent/50";
  if (ratio < 0.8) return "bg-accent/70";
  return "bg-accent/90";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Deterministic pastel hue from a string
function avatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 60%)`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "14d", label: "14 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

// Category colors — cycle through a palette
const CATEGORY_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
];

// ---- Period Selector -------------------------------------------------------

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (p: PeriodKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.key
              ? "bg-accent text-accent-text shadow-xs"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---- Stat Card -------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "stable";
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-surface-1 p-4 shadow-xs">
      <div className="rounded-lg bg-surface-2 p-2.5">
        <Icon size={18} className="text-accent" strokeWidth={1.8} />
      </div>
      <div className="flex-1">
        <p className="text-xs text-text-muted">{label}</p>
        <div className="flex items-end gap-2">
          <p className="text-xl font-bold text-text-primary">{value}</p>
          {trend && trend !== "stable" && (
            <span className={trend === "up" ? "text-red-500" : "text-emerald-500"}>
              {trend === "up" ? (
                <TrendingUp size={14} />
              ) : (
                <TrendingDown size={14} />
              )}
            </span>
          )}
          {trend === "stable" && <Minus size={14} className="text-text-muted" />}
        </div>
        {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
      </div>
    </div>
  );
}

// ---- Stacked Volume Chart --------------------------------------------------

function StackedVolumeChart({ data }: { data: VolumeData }) {
  const days = data.days;
  const maxTotal = Math.max(
    ...days.map((d) => d.received + d.sent + d.autoHandled),
    1,
  );

  // Show a tick label every N days to avoid crowding
  const labelStep = days.length <= 14 ? 1 : days.length <= 31 ? 3 : 7;

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BarChart3 size={16} className="text-accent" />
          Email Volume
        </h3>
        {/* Legend */}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500/70" />
            Received
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
            Sent
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-violet-500/70" />
            Auto-handled
          </span>
        </div>
      </div>
      <div className="flex h-40 items-end gap-1">
        {days.map((day, i) => {
          const total = day.received + day.sent + day.autoHandled;
          const totalPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
          const recvPct = total > 0 ? (day.received / total) * 100 : 0;
          const sentPct = total > 0 ? (day.sent / total) * 100 : 0;
          const autoPct = total > 0 ? (day.autoHandled / total) * 100 : 0;
          const showLabel = i % labelStep === 0;

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col items-center gap-0.5"
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-20 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-surface-3 px-2 py-1.5 text-[10px] font-medium text-text-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                <div className="font-semibold">{formatDate(day.date)}</div>
                <div className="text-blue-400">In: {day.received}</div>
                <div className="text-emerald-400">Out: {day.sent}</div>
                <div className="text-violet-400">Auto: {day.autoHandled}</div>
              </div>
              {/* Stacked bar */}
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                style={{ height: `${Math.max(totalPct, total > 0 ? 2 : 0)}%` }}
              >
                <div
                  className="w-full shrink-0 bg-blue-500/70 transition-all"
                  style={{ height: `${recvPct}%` }}
                />
                <div
                  className="w-full shrink-0 bg-emerald-500/70 transition-all"
                  style={{ height: `${sentPct}%` }}
                />
                <div
                  className="w-full shrink-0 bg-violet-500/70 transition-all"
                  style={{ height: `${autoPct}%` }}
                />
              </div>
              {/* Date label */}
              <span className="text-[9px] text-text-muted">
                {showLabel ? formatDate(day.date).replace(/\s\d{4}$/, "") : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Top Senders / Recipients ---------------------------------------------

function PersonList({
  title,
  icon: Icon,
  items,
  countLabel,
  onClickEmail,
}: {
  title: string;
  icon: React.ElementType;
  items: Array<{ email: string; name: string; count: number; sub?: string }>;
  countLabel: string;
  onClickEmail?: (email: string) => void;
}) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Icon size={16} className="text-accent" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No data for this period.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const barPct = (item.count / maxCount) * 100;
            const initials = initialsFromName(item.name);
            const color = avatarColor(item.email);

            return (
              <li key={item.email} className="group">
                <div className="flex items-center gap-2.5">
                  {/* Avatar */}
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {initials}
                  </div>
                  {/* Name + bar */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-1 text-left"
                        onClick={() => onClickEmail?.(item.email)}
                        title={item.email}
                      >
                        <span className="truncate text-xs font-medium text-text-primary">
                          {item.name !== item.email ? item.name : item.email}
                        </span>
                        {onClickEmail && (
                          <ArrowRight
                            size={11}
                            className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        )}
                      </button>
                      <span className="shrink-0 text-[11px] font-semibold text-text-secondary">
                        {item.count} {countLabel}
                      </span>
                    </div>
                    {item.sub && (
                      <p className="mb-0.5 text-[10px] text-text-muted">{item.sub}</p>
                    )}
                    <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-accent/50 transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---- Category Distribution -------------------------------------------------

function CategoryDistribution({ data }: { data: CategoryData }) {
  const total = data.categories.reduce((s, c) => s + c.count, 0);

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Tag size={16} className="text-accent" />
        Email Categories
      </h3>

      {data.categories.length === 0 ? (
        <p className="text-xs text-text-muted">
          No classified emails yet. AI classification runs after sync.
        </p>
      ) : (
        <>
          {/* Segmented bar */}
          <div className="mb-4 flex h-3 overflow-hidden rounded-full">
            {data.categories.map((cat, i) => (
              <div
                key={cat.name}
                title={`${cat.name}: ${cat.pct}%`}
                className={`${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} transition-all`}
                style={{ width: `${cat.pct}%` }}
              />
            ))}
          </div>

          <ul className="space-y-2">
            {data.categories.map((cat, i) => (
              <li key={cat.name} className="flex items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                  {cat.name}
                </span>
                <span className="shrink-0 text-[11px] text-text-muted">{cat.count}</span>
                <span className="w-10 shrink-0 text-right text-[11px] font-medium text-text-primary">
                  {cat.pct}%
                </span>
                <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} opacity-70`}
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-right text-[10px] text-text-muted">
            {total.toLocaleString()} classified threads
          </p>
        </>
      )}
    </section>
  );
}

// ---- Response Time Details -------------------------------------------------

function ResponseTimePanel({ data }: { data: ResponseTimeData }) {
  const maxAvg = Math.max(...data.byDay.map((d) => d.avgMinutes), 1);

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Clock size={16} className="text-accent" />
        Response Time
      </h3>

      {/* Stat pills */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "Avg", value: formatMinutes(data.avgMinutes) },
          { label: "Median", value: formatMinutes(data.medianMinutes) },
          { label: "p95", value: formatMinutes(data.p95Minutes) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-surface-2 px-3 py-2 text-center"
          >
            <p className="text-[10px] text-text-muted">{s.label}</p>
            <p className="text-sm font-bold text-text-primary">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Line chart — trend by day */}
      {data.byDay.length > 1 && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] text-text-muted">Trend (avg per day)</p>
          <div className="flex h-20 items-end gap-1">
            {data.byDay.map((day, i) => {
              const heightPct = maxAvg > 0 ? (day.avgMinutes / maxAvg) * 100 : 0;
              const showLabel =
                i === 0 || i === data.byDay.length - 1;
              return (
                <div
                  key={day.date}
                  className="group relative flex flex-1 flex-col items-center gap-0.5"
                >
                  <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-surface-3 px-1.5 py-1 text-[9px] text-text-primary opacity-0 shadow-sm group-hover:opacity-100">
                    {formatDate(day.date)}: {formatMinutes(day.avgMinutes)}
                  </div>
                  <div
                    className="w-full rounded-t-sm bg-amber-500/60 transition-all hover:bg-amber-500"
                    style={{
                      height: `${Math.max(heightPct, day.avgMinutes > 0 ? 4 : 0)}%`,
                    }}
                  />
                  <span className="text-[9px] text-text-muted">
                    {showLabel ? formatDate(day.date).split(" ")[0] : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slowest senders */}
      {data.bySender.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] text-text-muted">
            Slowest response senders
          </p>
          <ul className="space-y-1.5">
            {data.bySender.map((s) => (
              <li key={s.email} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {s.email}
                </span>
                <span className="shrink-0 font-semibold text-text-primary">
                  {formatMinutes(s.avgMinutes)}
                </span>
                <span className="shrink-0 text-text-muted">
                  ({s.count} replies)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.avgMinutes === 0 && data.byDay.length === 0 && (
        <p className="text-xs text-text-muted">
          No response pairs found in this period.
        </p>
      )}
    </section>
  );
}

// ---- Automation Breakdown --------------------------------------------------

function AutomationBreakdown({
  breakdown,
  ratePct,
}: {
  breakdown: Array<{ label: string; count: number; color: string }>;
  ratePct: number;
}) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Zap size={16} className="text-accent" />
        Automation Breakdown
      </h3>
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-text-muted">Automation rate</span>
          <span className="font-semibold text-text-primary">{ratePct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${ratePct}%` }}
          />
        </div>
      </div>
      {total > 0 && (
        <div className="space-y-2">
          {breakdown.map((item, i) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={i}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{item.label}</span>
                  <span className="text-text-muted">
                    {item.count} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---- Heatmap ---------------------------------------------------------------

// Group 24 hours into 8 three-hour blocks for mobile condensed view
const CONDENSED_HOUR_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

function condenseRow(row: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < 24; i += 3) {
    result.push(row[i] + row[i + 1] + row[i + 2]);
  }
  return result;
}

function BusiestHoursHeatmap({ grid, maxValue }: HeatmapData) {
  // Condensed grid sums each 3-hour block; recalculate max for correct colour scaling
  const condensedGrid = grid.map(condenseRow);
  const condensedMax = Math.max(...condensedGrid.flatMap((r) => r), 1);

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Clock size={16} className="text-accent" />
        Busiest Hours
      </h3>

      {/* Mobile condensed view (8 blocks of 3h) — avoids tiny cells and horizontal scroll */}
      <div className="sm:hidden">
        <div className="mb-1 ml-10 grid grid-cols-8 gap-0.5">
          {CONDENSED_HOUR_LABELS.map((label) => (
            <div key={label} className="text-center text-[8px] text-text-muted">
              {label}
            </div>
          ))}
        </div>
        {condensedGrid.map((row, dayIdx) => (
          <div key={dayIdx} className="mb-0.5 flex items-center gap-1">
            <span className="w-9 shrink-0 text-right text-[10px] text-text-muted">
              {DAY_LABELS[dayIdx]}
            </span>
            <div className="grid flex-1 grid-cols-8 gap-0.5">
              {row.map((val, blockIdx) => (
                <div
                  key={blockIdx}
                  title={`${DAY_LABELS[dayIdx]} ${CONDENSED_HOUR_LABELS[blockIdx]} — ${val} emails`}
                  className={`aspect-square rounded-[2px] ${heatmapColor(val, condensedMax)} transition-colors`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="ml-10 mt-2 flex items-center gap-2">
          <span className="text-[10px] text-text-muted">Less</span>
          {["bg-surface-3", "bg-accent/15", "bg-accent/30", "bg-accent/50", "bg-accent/70", "bg-accent/90"].map(
            (cls, i) => (
              <div key={i} className={`h-3 w-3 rounded-[2px] ${cls}`} />
            ),
          )}
          <span className="text-[10px] text-text-muted">More</span>
        </div>
      </div>

      {/* Desktop full 24-column view with horizontal scroll fallback */}
      <div className="hidden overflow-x-auto sm:block">
        <div className="min-w-[400px]">
          <div className="mb-1 ml-10 grid grid-cols-[repeat(24,1fr)] gap-0.5">
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="text-center text-[8px] text-text-muted">
                {HOUR_LABELS[Math.floor(h / 3)] && h % 3 === 0
                  ? HOUR_LABELS[Math.floor(h / 3)]
                  : ""}
              </div>
            ))}
          </div>
          {grid.map((row, dayIdx) => (
            <div key={dayIdx} className="mb-0.5 flex items-center gap-1">
              <span className="w-9 shrink-0 text-right text-[10px] text-text-muted">
                {DAY_LABELS[dayIdx]}
              </span>
              <div className="grid flex-1 grid-cols-[repeat(24,1fr)] gap-0.5">
                {row.map((val, hourIdx) => (
                  <div
                    key={hourIdx}
                    title={`${DAY_LABELS[dayIdx]} ${hourIdx}:00 — ${val} emails`}
                    className={`aspect-square rounded-[2px] ${heatmapColor(val, maxValue)} transition-colors`}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="ml-10 mt-2 flex items-center gap-2">
            <span className="text-[10px] text-text-muted">Less</span>
            {[
              "bg-surface-3",
              "bg-accent/15",
              "bg-accent/30",
              "bg-accent/50",
              "bg-accent/70",
              "bg-accent/90",
            ].map((cls, i) => (
              <div key={i} className={`h-3 w-3 rounded-[2px] ${cls}`} />
            ))}
            <span className="text-[10px] text-text-muted">More</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Loading Skeleton -------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-lg sm:w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-52 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

// ---- Helpers for normalising legacy dashboard shape ------------------------

function normalizeDashboard(raw: Record<string, unknown>): DashboardData {
  // The dashboard API returns InboxHealthResult, not the old DashboardData shape.
  // Map both shapes so the component works regardless of which API version answers.
  const totalAutoArchived = (raw.totalAutoArchived as number) ?? 0;
  const totalAutoDeleted = (raw.totalAutoDeleted as number) ?? 0;
  const totalReceived = (raw.totalReceived as number) ?? 0;
  const totalSent = (raw.totalSent as number) ?? 0;
  const totalEmails = totalReceived + totalSent;

  const automationRatePct = totalEmails > 0
    ? Math.round(((totalAutoArchived + totalAutoDeleted) / totalEmails) * 100)
    : Math.round(((raw.automationRate as number) ?? 0) * 100);

  // Derive avg response time from the trend array
  const avgTrend = (raw.avgResponseTimeTrendMinutes as Array<{ avg: number | null }>) ?? [];
  const validAvgs = avgTrend.map((r) => r.avg).filter((v): v is number => v !== null);
  const avgResponseTimeMinutes =
    validAvgs.length > 0
      ? validAvgs.reduce((s, v) => s + v, 0) / validAvgs.length
      : 0;

  // Time saved: rough estimate — 2 min per auto-handled email
  const timeSavedHours = parseFloat(
    (((totalAutoArchived + totalAutoDeleted) * 2) / 60).toFixed(1),
  );

  // Volume by day from volumeTrends
  const volumeTrends =
    (raw.volumeTrends as Array<{ date: string; received: number; sent: number }>) ?? [];
  const volumeByDay = volumeTrends.map((vt) => ({
    label: formatDate(vt.date).split(" ")[0],
    count: vt.received + vt.sent,
  }));

  // Automation breakdown
  const automationBreakdown = [
    {
      label: "Auto-archived",
      count: totalAutoArchived,
      color: "bg-accent",
    },
    {
      label: "Auto-deleted",
      count: totalAutoDeleted,
      color: "bg-red-500/70",
    },
    {
      label: "AI draft accepted",
      count:
        (raw as Record<string, unknown>).draftAcceptanceRate !== undefined
          ? Math.round(
              ((raw.draftAcceptanceRate as number) ?? 0) *
                ((raw.totalReceived as number) ?? 0),
            )
          : 0,
      color: "bg-emerald-500/70",
    },
  ].filter((b) => b.count > 0);

  // Unread trend — not available from this API, default stable
  const unreadTrend: "stable" | "up" | "down" = "stable";
  const unreadTrendPct = 0;

  return {
    avgResponseTimeMinutes,
    automationRatePct,
    timeSavedHours,
    unreadTrend,
    unreadTrendPct,
    volumeByDay,
    automationBreakdown,
  };
}

// ---- Main ------------------------------------------------------------------

export function InboxHealthDashboard() {
  const toast = useToast();

  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [volumeData, setVolumeData] = useState<VolumeData | null>(null);
  const [senderData, setSenderData] = useState<SenderData | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryData | null>(null);
  const [responseTimeData, setResponseTimeData] = useState<ResponseTimeData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    async (p: PeriodKey) => {
      setLoading(true);
      try {
        // Range map: dashboard uses 7d/30d/90d; map 14d -> 30d for it
        const dashRange = p === "14d" ? "30d" : p;
        const heatDays =
          p === "7d" ? 7 : p === "14d" ? 14 : p === "30d" ? 30 : 90;

        const [dashRes, heatRes, volRes, sendRes, catRes, rtRes] =
          await Promise.all([
            fetch(`/api/analytics/dashboard?range=${dashRange}`),
            fetch(`/api/analytics/heatmap?days=${heatDays}`),
            fetch(`/api/analytics/volume?period=${p}`),
            fetch(`/api/analytics/senders?period=${p}&limit=15`),
            fetch(`/api/analytics/categories?period=${p}`),
            fetch(`/api/analytics/response-times?period=${p}`),
          ]);

        if (!dashRes.ok) throw new Error("Failed to load analytics");

        const dashRaw = (await dashRes.json()) as Record<string, unknown>;
        setDashboard(normalizeDashboard(dashRaw));

        if (heatRes.ok) {
          const heatJson = (await heatRes.json()) as {
            cells: Array<{ hour: number; dayOfWeek: number; count: number }>;
          };
          // Convert cells array to 7x24 grid
          const grid: number[][] = Array.from({ length: 7 }, () =>
            new Array<number>(24).fill(0),
          );
          let maxValue = 0;
          for (const cell of heatJson.cells ?? []) {
            grid[cell.dayOfWeek][cell.hour] = cell.count;
            if (cell.count > maxValue) maxValue = cell.count;
          }
          setHeatmap({ grid, maxValue });
        }

        if (volRes.ok) {
          setVolumeData((await volRes.json()) as VolumeData);
        }

        if (sendRes.ok) {
          setSenderData((await sendRes.json()) as SenderData);
        }

        if (catRes.ok) {
          setCategoryData((await catRes.json()) as CategoryData);
        }

        if (rtRes.ok) {
          setResponseTimeData((await rtRes.json()) as ResponseTimeData);
        }
      } catch (e) {
        toast.show(
          e instanceof Error ? e.message : "Failed to load analytics",
          "error",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  if (loading) return <DashboardSkeleton />;

  if (!dashboard) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No analytics data yet"
        description="Sync your email and use the app for a few days to see inbox health metrics."
      />
    );
  }

  const senders = senderData?.senders ?? [];
  const recipients = senderData?.recipients ?? [];

  return (
    <div className="space-y-6">
      {/* Header row: title + period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">Inbox Analytics</h2>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Stat cards — 2 columns on mobile/tablet, 4 on desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Avg Response Time"
          value={formatMinutes(dashboard.avgResponseTimeMinutes)}
          icon={Clock}
        />
        <StatCard
          label="Automation Rate"
          value={`${dashboard.automationRatePct}%`}
          sub="of emails auto-handled"
          icon={Zap}
        />
        <StatCard
          label="Time Saved"
          value={`${dashboard.timeSavedHours}h`}
          sub="estimated this period"
          icon={Timer}
        />
        <StatCard
          label="Unread Trend"
          value={`${dashboard.unreadTrendPct > 0 ? "+" : ""}${dashboard.unreadTrendPct}%`}
          sub="vs previous period"
          icon={BarChart3}
          trend={dashboard.unreadTrend}
        />
      </div>

      {/* Volume chart — stacked */}
      {volumeData && volumeData.days.length > 0 ? (
        <StackedVolumeChart data={volumeData} />
      ) : dashboard.volumeByDay.length > 0 ? (
        // Fallback to legacy simple chart while new endpoint is warming up
        <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <BarChart3 size={16} className="text-accent" />
            Email Volume
          </h3>
          <div className="flex h-36 items-end gap-2">
            {dashboard.volumeByDay.map((day, i) => {
              const max = Math.max(...dashboard.volumeByDay.map((d) => d.count), 1);
              const heightPct = max > 0 ? (day.count / max) * 100 : 0;
              return (
                <div
                  key={i}
                  className="group relative flex flex-1 flex-col items-center gap-1"
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-3 px-2 py-1 text-[10px] font-medium text-text-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                    {day.count}
                  </div>
                  <div
                    className="w-full rounded-t-sm bg-accent/60 transition-all hover:bg-accent"
                    style={{ height: `${heightPct}%`, minHeight: day.count > 0 ? "4px" : "0" }}
                  />
                  <span className="text-[10px] text-text-muted">{day.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Top Senders + Top Recipients — md covers iPad Mini (768px+) range */}
      <div className="grid gap-4 md:grid-cols-2">
        <PersonList
          title="Top Senders"
          icon={Users}
          countLabel="emails"
          items={senders.map((s) => ({
            email: s.email,
            name: s.name,
            count: s.count,
            sub: s.domain,
          }))}
        />
        <PersonList
          title="Top Recipients"
          icon={Send}
          countLabel="sent"
          items={recipients.map((r) => ({
            email: r.email,
            name: r.name,
            count: r.count,
          }))}
        />
      </div>

      {/* Category Distribution + Response Time */}
      <div className="grid gap-4 md:grid-cols-2">
        {categoryData ? (
          <CategoryDistribution data={categoryData} />
        ) : (
          <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
            <p className="text-sm text-text-muted">Category data not available.</p>
          </section>
        )}
        {responseTimeData ? (
          <ResponseTimePanel data={responseTimeData} />
        ) : (
          <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
            <p className="text-sm text-text-muted">Response time data not available.</p>
          </section>
        )}
      </div>

      {/* Automation + Heatmap */}
      <div className="grid gap-4 md:grid-cols-2">
        <AutomationBreakdown
          breakdown={dashboard.automationBreakdown}
          ratePct={dashboard.automationRatePct}
        />
        {heatmap ? (
          <BusiestHoursHeatmap grid={heatmap.grid} maxValue={heatmap.maxValue} />
        ) : (
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-sm text-text-muted">
              Heatmap data not available yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
