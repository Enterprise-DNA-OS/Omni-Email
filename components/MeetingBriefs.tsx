"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings2,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

interface MeetingBrief {
  id: string;
  event_id: string | null;
  event_title: string;
  event_start: string;
  attendees: { name?: string; email: string }[];
  brief_content: string | null;
  status: "pending" | "generating" | "ready" | "failed" | "expired";
  generated_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface BriefSettings {
  meeting_briefs_enabled: boolean;
  meeting_briefs_lead_minutes: number;
}

interface BriefsResponse {
  data: MeetingBrief[];
}

interface SettingsResponse {
  data: BriefSettings;
}

function StatusBadge({ status }: { status: MeetingBrief["status"] }) {
  const configs: Record<
    MeetingBrief["status"],
    { label: string; icon: typeof CheckCircle2; className: string }
  > = {
    pending: {
      label: "Pending",
      icon: Clock,
      className: "bg-surface-2 text-text-muted",
    },
    generating: {
      label: "Generating",
      icon: Loader2,
      className: "bg-accent-muted text-accent",
    },
    ready: {
      label: "Ready",
      icon: CheckCircle2,
      className: "bg-success-muted text-success",
    },
    failed: {
      label: "Failed",
      icon: XCircle,
      className: "bg-danger-muted text-danger",
    },
    expired: {
      label: "Expired",
      icon: AlertCircle,
      className: "bg-surface-2 text-text-muted",
    },
  };

  const { label, icon: Icon, className } = configs[status];
  const spinning = status === "generating";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon size={11} className={spinning ? "animate-spin" : ""} />
      {label}
    </span>
  );
}

function BriefCard({
  brief,
  onDelete,
}: {
  brief: MeetingBrief;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const eventDate = new Date(brief.event_start);
  const formattedDate = eventDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const formattedTime = eventDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/meeting-briefs/${brief.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to delete brief", "error");
        return;
      }
      onDelete(brief.id);
      toast.show("Brief deleted.", "success");
    } catch {
      toast.show("Failed to delete brief", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 shadow-xs">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted">
          <Calendar size={16} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {brief.event_title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span>{formattedDate}</span>
            <span>at</span>
            <span>{formattedTime}</span>
            {brief.attendees.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={11} />
                {brief.attendees.length} attendee
                {brief.attendees.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={brief.status} />
          {brief.brief_content && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse brief" : "Expand brief"}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete brief"
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Brief content */}
      {expanded && brief.brief_content && (
        <div className="border-t border-border px-4 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-secondary">
            {brief.brief_content}
          </pre>
          {brief.generated_at && (
            <p className="mt-3 text-xs text-text-muted">
              Generated{" "}
              {new Date(brief.generated_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      )}

      {/* Failed state */}
      {brief.status === "failed" && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-danger">
            Brief generation failed. You can delete this and try again.
          </p>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
}: {
  settings: BriefSettings;
  onSave: (s: BriefSettings) => void;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(settings.meeting_briefs_enabled);
  const [leadMinutes, setLeadMinutes] = useState(
    settings.meeting_briefs_lead_minutes,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/meeting-briefs/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_briefs_enabled: enabled,
          meeting_briefs_lead_minutes: leadMinutes,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to save settings", "error");
        return;
      }
      onSave({ meeting_briefs_enabled: enabled, meeting_briefs_lead_minutes: leadMinutes });
      toast.show("Settings saved.", "success");
    } catch {
      toast.show("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        Brief Settings
      </h3>
      <div className="space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Auto-generate briefs
            </p>
            <p className="text-xs text-text-muted">
              Generate a briefing before each upcoming meeting
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
              enabled ? "bg-accent" : "bg-surface-3"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Lead time */}
        <div>
          <label
            htmlFor="lead-minutes"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Generate brief before meeting
          </label>
          <div className="flex items-center gap-2">
            <select
              id="lead-minutes"
              value={leadMinutes}
              onChange={(e) => setLeadMinutes(parseInt(e.target.value, 10))}
              className="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value={5}>5 minutes before</option>
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={120}>2 hours before</option>
              <option value={1440}>1 day before</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Save Settings
        </button>
      </div>
    </div>
  );
}

export function MeetingBriefs() {
  const toast = useToast();
  const [briefs, setBriefs] = useState<MeetingBrief[]>([]);
  const [settings, setSettings] = useState<BriefSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const fetchBriefs = useCallback(async () => {
    try {
      const res = await fetch("/api/meeting-briefs");
      if (!res.ok) return;
      const data = (await res.json()) as BriefsResponse;
      setBriefs(data.data ?? []);
    } catch {
      // non-critical
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/meeting-briefs/settings");
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBriefs(), fetchSettings()]).finally(() => setLoading(false));
  }, [fetchBriefs, fetchSettings]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/meeting-briefs/generate", {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to generate briefs", "error");
        return;
      }
      const data = (await res.json()) as {
        generated: number;
        message?: string;
        errors?: { eventId: string; error: string }[];
      };

      if (data.generated > 0) {
        toast.show(
          `Generated ${data.generated} brief${data.generated !== 1 ? "s" : ""}.`,
          "success",
        );
        await fetchBriefs();
      } else {
        toast.show(data.message ?? "No new briefs to generate.", "info");
      }
    } catch {
      toast.show("Failed to generate briefs", "error");
    } finally {
      setGenerating(false);
    }
  }

  function handleDelete(id: string) {
    setBriefs((prev) => prev.filter((b) => b.id !== id));
  }

  const upcomingBriefs = briefs.filter(
    (b) => new Date(b.event_start) >= new Date(),
  );
  const pastBriefs = briefs.filter(
    (b) => new Date(b.event_start) < new Date(),
  );

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Zap size={15} />
          )}
          {generating ? "Generating..." : "Generate Briefs"}
        </button>

        <button
          type="button"
          onClick={() => void fetchBriefs()}
          disabled={loading}
          aria-label="Refresh briefs"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>

        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className={`ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            showSettings
              ? "border-accent bg-accent-muted text-accent"
              : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          }`}
        >
          <Settings2 size={14} />
          Settings
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onSave={(s) => setSettings(s)}
        />
      )}

      {/* Brief list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface-1 p-4"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded" />
                  <Skeleton className="h-3 w-32 rounded" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : briefs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No meeting briefs yet"
          description="Click Generate Briefs to create AI briefings for your upcoming meetings, or enable auto-generation in Settings."
          action={
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {generating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Zap size={15} />
              )}
              Generate Briefs
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* Upcoming */}
          {upcomingBriefs.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <Calendar size={12} />
                Upcoming meetings
              </h3>
              <div className="space-y-3">
                {upcomingBriefs.map((brief) => (
                  <BriefCard key={brief.id} brief={brief} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {pastBriefs.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <Clock size={12} />
                Past meetings
              </h3>
              <div className="space-y-3">
                {pastBriefs.map((brief) => (
                  <BriefCard key={brief.id} brief={brief} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
