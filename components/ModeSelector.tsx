"use client";

import { useState } from "react";
import {
  Mail,
  Crown,
  Bot,
  TrendingUp,
  Headphones,
  Plane,
  Focus,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import type { LucideIcon } from "lucide-react";

type Mode = "default" | "ceo" | "assistant" | "sales" | "support" | "travel" | "deep_work";

interface ModeConfig {
  value: Mode;
  label: string;
  icon: LucideIcon;
  description: string;
  iconColor: string;
  borderColor: string;
  bgColor: string;
}

const MODES: ModeConfig[] = [
  {
    value: "default",
    label: "Default",
    icon: Mail,
    description: "Standard inbox behaviour with balanced AI actions.",
    iconColor: "text-text-secondary",
    borderColor: "border-accent",
    bgColor: "bg-accent-muted",
  },
  {
    value: "ceo",
    label: "CEO",
    icon: Crown,
    description: "High-priority focus. AI surfaces only critical items.",
    iconColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
  },
  {
    value: "assistant",
    label: "Assistant",
    icon: Bot,
    description: "Proactive handling. AI drafts replies and manages routine tasks.",
    iconColor: "text-violet-600 dark:text-violet-400",
    borderColor: "border-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-900/20",
  },
  {
    value: "sales",
    label: "Sales",
    icon: TrendingUp,
    description: "Lead-focused. AI prioritises prospect and deal emails.",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  {
    value: "support",
    label: "Support",
    icon: Headphones,
    description: "Customer-first. AI flags open tickets and drafts resolutions.",
    iconColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    value: "travel",
    label: "Travel",
    icon: Plane,
    description: "Trip mode. AI extracts bookings and surfaces travel updates.",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    borderColor: "border-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-900/20",
  },
  {
    value: "deep_work",
    label: "Deep Work",
    icon: Focus,
    description: "Do Not Disturb. AI auto-handles low-priority mail silently.",
    iconColor: "text-rose-600 dark:text-rose-400",
    borderColor: "border-rose-400",
    bgColor: "bg-rose-50 dark:bg-rose-900/20",
  },
];

interface ModeSelectorProps {
  initialMode?: Mode;
}

export function ModeSelector({ initialMode = "default" }: ModeSelectorProps) {
  const toast = useToast();
  const [activeMode, setActiveMode] = useState<Mode>(initialMode);
  const [switchingTo, setSwitchingTo] = useState<Mode | null>(null);

  async function handleSelect(mode: Mode) {
    if (mode === activeMode) return;
    setSwitchingTo(mode);
    try {
      const res = await fetch("/api/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Failed to switch mode", "error");
        return;
      }
      setActiveMode(mode);
      const config = MODES.find((m) => m.value === mode);
      toast.show(`Switched to ${config?.label ?? mode} mode.`, "success");
    } catch {
      toast.show("Failed to switch mode", "error");
    } finally {
      setSwitchingTo(null);
    }
  }

  const currentConfig = MODES.find((m) => m.value === activeMode);

  return (
    <div className="space-y-4">
      {currentConfig && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-0 px-3 py-2">
          <span className="text-xs text-text-muted">Active:</span>
          <currentConfig.icon size={14} className={currentConfig.iconColor} />
          <span className="text-sm font-medium text-text-primary">{currentConfig.label}</span>
          <span className="ml-1 text-xs text-text-muted">— {currentConfig.description}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODES.map((mode) => {
          const isActive = mode.value === activeMode;
          const isSwitching = switchingTo === mode.value;

          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode.value)}
              disabled={switchingTo !== null}
              className={`group relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all duration-150 ${
                isActive
                  ? `${mode.borderColor} ${mode.bgColor}`
                  : "border-border bg-surface-0 hover:border-border-muted hover:bg-surface-2"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              aria-pressed={isActive}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    isActive ? mode.bgColor : "bg-surface-2"
                  }`}
                >
                  {isSwitching ? (
                    <Loader2 size={16} className={`animate-spin ${mode.iconColor}`} />
                  ) : (
                    <mode.icon
                      size={16}
                      className={isActive ? mode.iconColor : "text-text-muted group-hover:text-text-secondary"}
                    />
                  )}
                </div>
                {isActive && (
                  <span className={`h-2 w-2 rounded-full ${mode.borderColor.replace("border-", "bg-")}`} />
                )}
              </div>
              <div>
                <p
                  className={`text-sm font-semibold ${
                    isActive ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {mode.label}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-text-muted">
                  {mode.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
