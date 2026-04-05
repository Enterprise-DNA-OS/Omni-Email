"use client";

import { useState } from "react";
import {
  Sparkles,
  FileText,
  Wand2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  MessageSquarePlus,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { AIFeedback } from "@/components/AIFeedback";
import {
  REPLY_MODE_GROUPS,
  REPLY_MODE_LABELS,
  type ReplyMode,
} from "@/lib/ai/reply-modes";

type Tone = ReplyMode;

export function AIPanel({
  threadId,
  draftText,
  onInsertReply,
}: {
  threadId: string;
  draftText: string;
  onInsertReply: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [activeTone, setActiveTone] = useState<Tone>("professional");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [improveLoading, setImproveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSummarize() {
    setSummaryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const json = (await res.json()) as { summary?: string; error?: string };
      if (json.error) {
        setError(json.error);
      } else {
        setSummary(json.summary ?? "");
      }
    } catch {
      setError("Failed to connect to AI service");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleSuggestReply(tone?: Tone) {
    const resolvedTone = tone ?? activeTone;
    setActiveTone(resolvedTone);
    setShowModeDropdown(false);
    setReplyLoading(true);
    setReplyText(null);
    setError(null);
    try {
      const body: Record<string, string> = { threadId, tone: resolvedTone };
      if (customInstruction.trim()) {
        body.customInstruction = customInstruction.trim();
      }
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { reply?: string; error?: string };
      if (json.error) {
        setError(json.error);
      } else {
        setReplyText(json.reply ?? "");
      }
    } catch {
      setError("Failed to connect to AI service");
    } finally {
      setReplyLoading(false);
    }
  }

  async function handleImprove() {
    setImproveLoading(true);
    setImprovedText(null);
    setError(null);
    try {
      const res = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draftText }),
      });
      const json = (await res.json()) as { improved?: string; error?: string };
      if (json.error) {
        setError(json.error);
      } else {
        setImprovedText(json.improved ?? "");
      }
    } catch {
      setError("Failed to connect to AI service");
    } finally {
      setImproveLoading(false);
    }
  }

  return (
    <div className="animate-slide-up">
      {/* Trigger bar */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-accent/20 bg-accent-muted px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent-muted/80"
      >
        <Sparkles size={16} />
        AI Assistant
        <span className="ml-auto">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-2 space-y-4 rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
          {error && (
            <p className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {/* Summarize */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Thread Summary
              </span>
              {!summary && (
                <button
                  type="button"
                  disabled={summaryLoading}
                  onClick={handleSummarize}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {summaryLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FileText size={13} />
                  )}
                  Summarize
                </button>
              )}
            </div>
            {summaryLoading && (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-4/5 rounded" />
              </div>
            )}
            {summary && (
              <p className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-text-secondary">
                {summary}
              </p>
            )}
          </div>

          {/* Reply suggestions */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Suggested Reply
            </span>

            {/* Mode selector row — flex-wrap so controls stack on narrow screens.
                On 320px phones the three controls will reflow to two lines:
                [Tone dropdown] [Generate] on line 1, [Custom] on line 2. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {/* Dropdown trigger */}
              <div className="relative">
                <button
                  type="button"
                  disabled={replyLoading}
                  onClick={() => setShowModeDropdown((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted/80 disabled:opacity-50"
                >
                  {REPLY_MODE_LABELS[activeTone]}
                  <ChevronDown size={12} />
                </button>

                {showModeDropdown && (
                  /* Viewport-safe positioning: on small screens the dropdown may
                     be wider than the available space to the right, so we use
                     right-0 to anchor to the trigger's right edge instead of
                     the left edge, keeping it within the viewport. */
                  <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
                    {REPLY_MODE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          {group.label}
                        </p>
                        {group.modes.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setActiveTone(mode);
                              setShowModeDropdown(false);
                              setReplyText(null);
                            }}
                            /* py-2.5 for better touch target */
                            className={`flex w-full items-center justify-between px-3 py-2.5 text-xs transition-colors hover:bg-surface-2 ${
                              activeTone === mode
                                ? "font-semibold text-accent"
                                : "text-text-secondary"
                            }`}
                          >
                            {REPLY_MODE_LABELS[mode]}
                            {activeTone === mode && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Generate button */}
              <button
                type="button"
                disabled={replyLoading}
                onClick={() => handleSuggestReply()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {replyLoading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                Generate
              </button>

              {/* Custom instruction toggle — ml-auto pushes to the right while
                  still participating in flex-wrap on very small screens */}
              <button
                type="button"
                onClick={() => setShowCustomInput((v) => !v)}
                className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  showCustomInput
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-muted hover:bg-surface-2"
                }`}
                title="Add custom instruction"
              >
                <MessageSquarePlus size={12} />
                Custom
              </button>
            </div>

            {/* Custom instruction input */}
            {showCustomInput && (
              <div className="mb-3">
                <input
                  type="text"
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  placeholder="e.g. Mention the project deadline, keep it under 2 paragraphs..."
                  maxLength={500}
                  className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            )}

            {replyLoading && (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-3 w-5/6 rounded" />
              </div>
            )}
            {replyText && (
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="mb-3 text-sm leading-relaxed text-text-secondary">{replyText}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onInsertReply(replyText)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover"
                  >
                    <Check size={13} />
                    Use this reply
                  </button>
                  <AIFeedback
                    threadId={threadId}
                    feedbackType="draft"
                    aiOutput={{ type: "suggested_reply", tone: activeTone, text: replyText }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Improve draft */}
          {draftText.trim().length > 0 && (
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Improve Draft
              </span>
              <button
                type="button"
                disabled={improveLoading}
                onClick={handleImprove}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                {improveLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Wand2 size={13} />
                )}
                Improve my draft
              </button>
              {improvedText && (
                <div className="mt-2 rounded-lg bg-surface-2 p-3">
                  <p className="mb-3 text-sm leading-relaxed text-text-secondary">
                    {improvedText}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onInsertReply(improvedText)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover"
                    >
                      <Check size={13} />
                      Use improved version
                    </button>
                    <AIFeedback
                      threadId={threadId}
                      feedbackType="draft"
                      aiOutput={{ type: "draft_improvement", original: draftText, improved: improvedText }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
