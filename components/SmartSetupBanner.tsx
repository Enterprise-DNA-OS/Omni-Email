"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Check,
  ArrowRight,
  X,
  Mail,
  Zap,
  Filter,
  Shield,
  Send,
  Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupStep {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  completed: boolean;
  href: string;
}

interface AccountRow {
  id: string;
}

interface ModeResponse {
  mode: string;
}

interface RuleRow {
  id: string;
}

interface ClassificationRow {
  id: string;
  classification: string;
}

interface AutoSendConfigRow {
  id: string;
}

interface SetupStatus {
  accountsConnected: boolean;
  modeConfigured: boolean;
  rulesCreated: boolean;
  vipSendersMarked: boolean;
  autoSendConfigured: boolean;
}

// ---------------------------------------------------------------------------
// LocalStorage key
// ---------------------------------------------------------------------------

const LS_DISMISSED_KEY = "smart-setup-dismissed";

// ---------------------------------------------------------------------------
// Progress bar sub-component
// ---------------------------------------------------------------------------

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${value} of ${max} steps complete`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step card sub-component
// ---------------------------------------------------------------------------

function StepCard({ step }: { step: SetupStep }) {
  const Icon = step.icon;

  if (step.completed) {
    return (
      <div
        className="flex min-w-[160px] max-w-[180px] shrink-0 flex-col gap-2 rounded-xl border border-success/30 bg-success-muted px-4 py-3"
        title={step.description}
      >
        <div className="flex items-center justify-between">
          <Icon size={15} className="text-success" />
          <Check size={13} className="text-success" />
        </div>
        <span className="text-xs font-medium leading-snug text-text-muted line-clamp-2">
          {step.label}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={step.href}
      className="flex min-w-[160px] max-w-[180px] shrink-0 flex-col gap-2 rounded-xl border border-border bg-surface-0 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      title={step.description}
    >
      <div className="flex items-center justify-between">
        <Icon size={15} className="text-accent" />
        <ArrowRight size={13} className="text-text-muted" />
      </div>
      <span className="text-xs font-medium leading-snug text-text-primary line-clamp-2">
        {step.label}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SmartSetupBannerProps {
  // Intentionally empty — data is fetched inside the component
}

export function SmartSetupBanner(_props: SmartSetupBannerProps) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [allDone, setAllDone] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load dismissed state from localStorage synchronously on mount to avoid flash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem(LS_DISMISSED_KEY);
    if (dismissed === "true") return; // already dismissed, skip fetch entirely

    let cancelled = false;

    async function fetchSetupStatus() {
      try {
        const [accountsRes, modeRes, rulesRes, classificationsRes, autoSendRes] =
          await Promise.all([
            fetch("/api/accounts"),
            fetch("/api/mode"),
            fetch("/api/rules"),
            fetch("/api/sender-classifications"),
            fetch("/api/auto-send/config"),
          ]);

        // Gracefully handle non-OK responses — treat as "not configured"
        const accounts: AccountRow[] = accountsRes.ok
          ? ((await accountsRes.json()) as AccountRow[])
          : [];

        const modeData: ModeResponse | null = modeRes.ok
          ? ((await modeRes.json()) as ModeResponse)
          : null;

        const rulesData: { rules?: RuleRow[] } | RuleRow[] | null = rulesRes.ok
          ? ((await rulesRes.json()) as { rules?: RuleRow[] } | RuleRow[])
          : null;

        const classificationsData:
          | { classifications?: ClassificationRow[] }
          | ClassificationRow[]
          | null = classificationsRes.ok
          ? ((await classificationsRes.json()) as
              | { classifications?: ClassificationRow[] }
              | ClassificationRow[])
          : null;

        const autoSendData: { configs?: AutoSendConfigRow[] } | null = autoSendRes.ok
          ? ((await autoSendRes.json()) as { configs?: AutoSendConfigRow[] })
          : null;

        if (cancelled) return;

        // Normalise response shapes — some endpoints return arrays, some wrap in a key
        const accountList = Array.isArray(accounts) ? accounts : [];

        const ruleList = Array.isArray(rulesData)
          ? rulesData
          : ((rulesData as { rules?: RuleRow[] } | null)?.rules ?? []);

        const classificationList = Array.isArray(classificationsData)
          ? classificationsData
          : ((classificationsData as { classifications?: ClassificationRow[] } | null)
              ?.classifications ?? []);

        const autoSendList = autoSendData?.configs ?? [];

        const hasVip = classificationList.some(
          (c: ClassificationRow) => c.classification === "vip",
        );

        const newStatus: SetupStatus = {
          accountsConnected: accountList.length > 0,
          modeConfigured: modeData !== null && modeData.mode !== "default",
          rulesCreated: ruleList.length > 0,
          vipSendersMarked: hasVip,
          autoSendConfigured: autoSendList.length > 0,
        };

        setStatus(newStatus);
        setVisible(true);
      } catch {
        // Network failure — silently skip the banner rather than crashing
      }
    }

    void fetchSetupStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive steps whenever status changes
  const steps: SetupStep[] = status
    ? [
        {
          id: "connect-account",
          label: "Connect an email account",
          description: "Link your Gmail or Outlook account to get started.",
          icon: Mail,
          completed: status.accountsConnected,
          href: "/settings",
        },
        {
          id: "first-sync",
          label: "Run your first sync",
          description:
            "Sync happens automatically once an account is connected.",
          icon: Zap,
          completed: status.accountsConnected,
          href: "/settings",
        },
        {
          id: "operating-mode",
          label: "Set your operating mode",
          description:
            "Choose how aggressively the AI manages your inbox.",
          icon: Brain,
          completed: status.modeConfigured,
          href: "/settings",
        },
        {
          id: "create-rule",
          label: "Create your first rule",
          description: "Automate actions like tagging and archiving.",
          icon: Filter,
          completed: status.rulesCreated,
          href: "/rules",
        },
        {
          id: "vip-senders",
          label: "Mark VIP senders",
          description: "Ensure emails from key contacts are never missed.",
          icon: Shield,
          completed: status.vipSendersMarked,
          href: "/settings",
        },
        {
          id: "auto-send",
          label: "Configure auto-send",
          description: "Let the AI send replies on your behalf when confident.",
          icon: Send,
          completed: status.autoSendConfigured,
          href: "/settings",
        },
      ]
    : [];

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;

  // Detect all-done and schedule auto-dismiss
  useEffect(() => {
    if (status === null || totalCount === 0) return;
    if (completedCount === totalCount) {
      setAllDone(true);
      autoDismissRef.current = setTimeout(() => {
        handleDismiss();
      }, 5000);
    }
    return () => {
      if (autoDismissRef.current !== null) {
        clearTimeout(autoDismissRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, totalCount, status]);

  function handleDismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_DISMISSED_KEY, "true");
    }
    setVisible(false);
    if (autoDismissRef.current !== null) {
      clearTimeout(autoDismissRef.current);
    }
  }

  if (!visible || status === null) return null;

  return (
    <div
      role="region"
      aria-label="Setup guide"
      className="animate-slide-up mb-6 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/10 via-purple-500/10 to-amber-500/10 p-4"
    >
      {/* Header row */}
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15">
          <Sparkles size={14} className="text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          {allDone ? (
            <p className="text-sm font-semibold text-success">
              You&apos;re all set! Your AI inbox is fully configured.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-text-primary">
                Get the most from your AI inbox
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {completedCount} of {totalCount} steps complete
              </p>
            </>
          )}
        </div>

        {/* Dismiss button — min 44px touch target */}
        <button
          type="button"
          onClick={handleDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Dismiss setup guide"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      {!allDone && (
        <div className="mb-4 px-0">
          <ProgressBar value={completedCount} max={totalCount} />
        </div>
      )}

      {/* Step cards — horizontal scroll on mobile */}
      {!allDone && (
        <div
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
          aria-label="Setup steps"
        >
          {steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}
