"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ShortcutEntry = { keys: string[]; description: string };

type ShortcutGroup = {
  title: string;
  shortcuts: ShortcutEntry[];
};

const groups: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["g", "then", "i"], description: "Go to Inbox" },
      { keys: ["g", "then", "c"], description: "Go to Calendar" },
      { keys: ["g", "then", "s"], description: "Go to Settings" },
      { keys: ["⌘", "K"], description: "Command palette" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["c"], description: "Compose email" },
      { keys: ["/"], description: "Search" },
      { keys: ["?"], description: "Show shortcuts" },
      { keys: ["Esc"], description: "Close / Go back" },
    ],
  },
  {
    title: "Inbox",
    shortcuts: [
      { keys: ["e"], description: "Archive selected" },
      { keys: ["#"], description: "Delete selected" },
    ],
  },
  {
    title: "Thread",
    shortcuts: [
      { keys: ["r"], description: "Reply" },
      { keys: ["e"], description: "Archive" },
      { keys: ["#"], description: "Delete" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-mono font-medium text-text-secondary">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed left-1/2 top-[15%] z-50 -translate-x-1/2 w-full max-w-2xl mx-4 rounded-2xl border border-border bg-surface-1 shadow-lg overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 py-5 max-h-[70vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((sc) => (
                  <div
                    key={sc.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-text-secondary">
                      {sc.description}
                    </span>
                    <span className="flex items-center gap-1">
                      {sc.keys.map((k, i) =>
                        k === "then" ? (
                          <span
                            key={i}
                            className="text-xs text-text-muted mx-0.5"
                          >
                            then
                          </span>
                        ) : (
                          <Kbd key={i}>{k}</Kbd>
                        )
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}
