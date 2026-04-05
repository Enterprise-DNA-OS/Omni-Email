"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, ChevronDown, Loader2 } from "lucide-react";

type FeedbackType = "classification" | "draft" | "action";

type ClassificationCorrection = {
  category?: string;
  priority?: string;
  intent?: string;
};

type DraftCorrection = {
  note?: string;
};

type UserCorrection = ClassificationCorrection | DraftCorrection | Record<string, unknown>;

const CATEGORY_OPTIONS = [
  "client",
  "billing",
  "support",
  "notification",
  "marketing",
  "internal",
  "personal",
  "security",
  "scheduling",
  "legal",
  "other",
];

const PRIORITY_OPTIONS = ["urgent", "high", "normal", "low", "ignore"];

const INTENT_OPTIONS = [
  "reply",
  "reply_urgent",
  "archive",
  "delete",
  "delegate",
  "schedule",
  "review",
  "ignore",
  "unsubscribe",
  "follow_up",
  "pay",
];

interface AIFeedbackProps {
  threadId: string;
  feedbackType: FeedbackType;
  aiOutput: Record<string, unknown>;
}

type FeedbackState = "idle" | "positive" | "negative" | "submitting" | "done";

export function AIFeedback({ threadId, feedbackType, aiOutput }: AIFeedbackProps) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [intent, setIntent] = useState("");
  const [draftNote, setDraftNote] = useState("");

  async function submitFeedback(positive: boolean, correction: UserCorrection = {}) {
    setState("submitting");
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          feedbackType,
          aiOutput,
          userCorrection: positive ? { positive: true } : correction,
        }),
      });
    } catch {
      // Non-fatal — feedback loss is acceptable
    }
    setState("done");
  }

  function handleThumbsUp() {
    if (state !== "idle") return;
    void submitFeedback(true);
  }

  function handleThumbsDown() {
    if (state !== "idle") return;
    setState("negative");
  }

  async function handleCorrectionSubmit() {
    let correction: UserCorrection = {};
    if (feedbackType === "classification") {
      const c: ClassificationCorrection = {};
      if (category) c.category = category;
      if (priority) c.priority = priority;
      if (intent) c.intent = intent;
      correction = c;
    } else if (feedbackType === "draft") {
      const d: DraftCorrection = {};
      if (draftNote.trim()) d.note = draftNote.trim();
      correction = d;
    }
    await submitFeedback(false, correction);
  }

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        Thanks!
      </span>
    );
  }

  if (state === "submitting") {
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 size={11} className="animate-spin text-text-muted" />
      </span>
    );
  }

  if (state === "negative") {
    return (
      <div className="mt-2 rounded-lg border border-border bg-surface-1 p-3 shadow-xs">
        {feedbackType === "classification" && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Correct classification
            </p>
            {/* Selects stack vertically on mobile for easier interaction.
                text-sm (14px) prevents iOS Safari auto-zoom on focus. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <div className="relative">
                <select
                  className="w-full min-w-[120px] appearance-none rounded-md border border-border bg-surface-0 py-2 pl-2 pr-6 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Category...</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={10}
                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
              <div className="relative">
                <select
                  className="w-full min-w-[120px] appearance-none rounded-md border border-border bg-surface-0 py-2 pl-2 pr-6 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">Priority...</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={10}
                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
              <div className="relative">
                <select
                  className="w-full min-w-[120px] appearance-none rounded-md border border-border bg-surface-0 py-2 pl-2 pr-6 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 sm:w-auto"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                >
                  <option value="">Intent...</option>
                  {INTENT_OPTIONS.map((i) => (
                    <option key={i} value={i}>
                      {i.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={10}
                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
            </div>
          </div>
        )}

        {feedbackType === "draft" && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              What was wrong?
            </p>
            {/* text-sm prevents iOS auto-zoom (16px base) */}
            <input
              type="text"
              className="w-full rounded-md border border-border bg-surface-0 px-2 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              placeholder="Describe the issue..."
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCorrectionSubmit();
                }
              }}
            />
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          {/* py-2 gives ~36px touch target; acceptable for a secondary inline widget */}
          <button
            type="button"
            onClick={() => void handleCorrectionSubmit()}
            className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => setState("idle")}
            className="px-1 py-2 text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label="AI feedback">
      {/* p-2.5 gives a ~40px touch target — close to the 44px minimum for an
          inline icon-only button that cannot be made larger without layout impact */}
      <button
        type="button"
        title="This was helpful"
        aria-label="Mark as helpful"
        onClick={handleThumbsUp}
        className={`rounded p-2.5 transition-colors ${
          state === "positive"
            ? "text-emerald-500"
            : "text-text-muted/40 hover:text-emerald-500"
        }`}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        type="button"
        title="This was wrong"
        aria-label="Mark as incorrect"
        onClick={handleThumbsDown}
        className="rounded p-2.5 text-text-muted/40 transition-colors hover:text-red-500"
      >
        <ThumbsDown size={13} />
      </button>
    </span>
  );
}
