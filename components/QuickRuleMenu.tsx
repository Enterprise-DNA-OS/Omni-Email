"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  ShieldOff,
  Archive,
  Trash2,
  Filter,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickRuleMenuProps {
  threadId: string;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  aiCategory: string | null;
}

interface RuleCondition {
  field: string;
  operator: string;
  value: string;
  logic: "AND" | "OR";
}

interface RuleAction {
  type: string;
  params: Record<string, unknown>;
}

interface Suggestion {
  id: string;
  label: string;
  description: string;
  icon: typeof ShieldOff;
  iconClass: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSuggestions(
  senderEmail: string | null,
  senderDomain: string | null,
  aiCategory: string | null,
): Suggestion[] {
  // Derive domain from email when senderDomain is not provided
  const domain = senderDomain ?? senderEmail?.split("@")[1] ?? null;

  const items: Suggestion[] = [];

  if (senderEmail) {
    items.push({
      id: "block-sender",
      label: `Block ${senderEmail}`,
      description: "Delete all future emails from this sender",
      icon: ShieldOff,
      iconClass: "text-danger",
      name: `Block ${senderEmail}`,
      conditions: [
        { field: "sender_email", operator: "equals", value: senderEmail, logic: "AND" },
      ],
      actions: [{ type: "delete", params: {} }],
    });
  }

  if (domain) {
    items.push({
      id: "archive-domain",
      label: `Auto-archive from ${domain}`,
      description: "Archive all emails from this domain",
      icon: Archive,
      iconClass: "text-text-secondary",
      name: `Auto-archive from ${domain}`,
      conditions: [
        { field: "sender_domain", operator: "equals", value: domain, logic: "AND" },
      ],
      actions: [{ type: "archive", params: {} }],
    });

    items.push({
      id: "delete-domain",
      label: `Delete all from ${domain}`,
      description: "Delete all emails from this domain",
      icon: Trash2,
      iconClass: "text-danger",
      name: `Delete all from ${domain}`,
      conditions: [
        { field: "sender_domain", operator: "equals", value: domain, logic: "AND" },
      ],
      actions: [{ type: "delete", params: {} }],
    });
  }

  if (aiCategory) {
    items.push({
      id: "archive-category",
      label: `Auto-archive "${aiCategory}" emails`,
      description: `Archive emails classified as ${aiCategory}`,
      icon: Archive,
      iconClass: "text-text-secondary",
      name: `Auto-archive ${aiCategory} emails`,
      conditions: [
        { field: "ai_category", operator: "equals", value: aiCategory, logic: "AND" },
      ],
      actions: [{ type: "archive", params: {} }],
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickRuleMenu({
  senderEmail,
  senderDomain,
  subject: _subject,
  aiCategory,
}: QuickRuleMenuProps) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  // Tracks which suggestion item is currently loading (by id)
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Build suggestions once per render — deps are stable string values
  const suggestions = buildSuggestions(senderEmail, senderDomain, aiCategory);

  // Close on outside click / touch and Escape key
  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  async function applySuggestion(suggestion: Suggestion) {
    if (loadingId) return; // prevent double-fire
    setLoadingId(suggestion.id);

    try {
      // Step 1: Create the rule
      const createRes = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suggestion.name,
          conditions: suggestion.conditions,
          actions: suggestion.actions,
          enabled: true,
          priority: 0,
        }),
      });

      if (!createRes.ok) {
        const err = (await createRes.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to create rule");
      }

      const created = (await createRes.json()) as { rule: { id: string } };
      const ruleId = created.rule.id;

      // Step 2: Apply rule immediately to existing threads
      const applyRes = await fetch("/api/rules/apply-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });

      if (applyRes.ok) {
        const applyData = (await applyRes.json()) as { appliedCount?: number };
        const count = applyData.appliedCount ?? 0;
        if (count > 0) {
          toast.show(
            `Rule created — applied to ${count} thread${count === 1 ? "" : "s"}`,
            "success",
          );
        } else {
          toast.show("Rule created — no matching threads found", "info");
        }
      } else {
        // apply-now may not be implemented yet; rule was still created
        toast.show("Rule created successfully", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.show(message, "error");
    } finally {
      setLoadingId(null);
      setOpen(false);
    }
  }

  function openCustomRule() {
    setOpen(false);
    router.push("/settings?tab=rules&new=1");
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Trigger button */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
      >
        <Zap size={14} className="shrink-0" />
        <span className="hidden sm:inline">Quick Rules</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
          {suggestions.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-text-tertiary">
              No suggestions available for this email.
            </p>
          ) : (
            suggestions.map((suggestion) => {
              const Icon = suggestion.icon;
              const isLoading = loadingId === suggestion.id;

              return (
                <button
                  key={suggestion.id}
                  type="button"
                  disabled={loadingId !== null}
                  onClick={() => applySuggestion(suggestion)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className={`shrink-0 ${suggestion.iconClass}`}>
                    {isLoading ? (
                      <Loader2 size={15} className="animate-spin text-text-secondary" />
                    ) : (
                      <Icon size={15} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text-primary">
                      {suggestion.label}
                    </span>
                    <span className="block truncate text-xs text-text-tertiary">
                      {suggestion.description}
                    </span>
                  </span>
                </button>
              );
            })
          )}

          {/* Divider */}
          <div className="my-1 border-t border-border" />

          {/* Custom rule entry */}
          <button
            type="button"
            disabled={loadingId !== null}
            onClick={openCustomRule}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <Filter size={15} className="shrink-0 text-text-secondary" />
            <span className="font-medium text-text-primary">Custom rule...</span>
          </button>
        </div>
      )}
    </div>
  );
}
