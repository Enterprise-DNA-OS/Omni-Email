"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  Inbox,
  Calendar,
  Settings,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Action = {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  action: () => void;
};

type CommandPaletteContextValue = {
  open: () => void;
  registerActions: (actions: Action[]) => () => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: () => {},
  registerActions: () => () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [registeredActions, setRegisteredActions] = useState<Action[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Wait for client mount before rendering portal (SSR safety)
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ---- Built-in actions ---------------------------------------------------

  const builtInActions: Action[] = useMemo(
    () => [
      {
        id: "inbox",
        label: "Go to Inbox",
        icon: Inbox,
        shortcut: "G I",
        action: () => router.push("/inbox"),
      },
      {
        id: "calendar",
        label: "Go to Calendar",
        icon: Calendar,
        shortcut: "G C",
        action: () => router.push("/calendar"),
      },
      {
        id: "settings",
        label: "Go to Settings",
        icon: Settings,
        shortcut: "G S",
        action: () => router.push("/settings"),
      },
      {
        id: "sync",
        label: "Sync now",
        icon: RefreshCw,
        action: () => {
          fetch("/api/sync/kick", { method: "POST" });
          toast.show("Sync requested", "success");
        },
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        icon: HelpCircle,
        shortcut: "?",
        action: () => setShowShortcuts(true),
      },
    ],
    [router, toast]
  );

  // ---- All actions (built-in + registered) --------------------------------

  const allActions = useMemo(
    () => [...builtInActions, ...registeredActions],
    [builtInActions, registeredActions]
  );

  // ---- Filtered actions ---------------------------------------------------

  const filtered = useMemo(() => {
    if (!query) return allActions;
    const q = query.toLowerCase();
    return allActions.filter((a) => a.label.toLowerCase().includes(q));
  }, [allActions, query]);
  const currentAction = filtered[
    filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1)
  ];

  // ---- Context value ------------------------------------------------------

  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setIsOpen(true);
  }, []);

  const registerActions = useCallback((actions: Action[]) => {
    setRegisteredActions((prev) => [...prev, ...actions]);
    return () => {
      setRegisteredActions((prev) =>
        prev.filter((a) => !actions.some((r) => r.id === a.id))
      );
    };
  }, []);

  const ctxValue = useMemo<CommandPaletteContextValue>(
    () => ({ open: openPalette, registerActions }),
    [openPalette, registerActions]
  );

  // ---- Global shortcut: Cmd/Ctrl + K -------------------------------------

  const shortcuts = useMemo(
    () => ({
      "mod+k": () => {
        if (isOpen) {
          setIsOpen(false);
        } else {
          openPalette();
        }
      },
    }),
    [isOpen, openPalette]
  );

  useKeyboardShortcuts(shortcuts);

  // ---- Execute action -----------------------------------------------------

  const execute = useCallback(
    (action: Action) => {
      setIsOpen(false);
      action.action();
    },
    []
  );

  // ---- Keyboard navigation inside the palette ----------------------------

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1 < filtered.length ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 >= 0 ? i - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentAction) {
        execute(currentAction);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  }

  // ---- Scroll active item into view --------------------------------------

  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (!list) return;
    const activeIndexInRange =
      filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);
    const active = list.children[activeIndexInRange] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered.length, isOpen]);

  // ---- Render -------------------------------------------------------------

  return (
    <CommandPaletteContext.Provider value={ctxValue}>
      {children}

      {/* Command palette modal */}
      {isOpen && mounted &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
              onClick={() => setIsOpen(false)}
            />
            {/* Panel
                Mobile: anchored near top (top-4) so virtual keyboard doesn't
                overlap. Desktop (sm+): classic 20%-from-top centered position.
                max-h-[50vh] on mobile prevents the list from reaching behind
                the keyboard when it's open. */}
            <div
              className="fixed left-4 right-4 top-4 z-50 overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-lg animate-slide-up sm:left-1/2 sm:right-auto sm:top-[20%] sm:w-full sm:max-w-xl sm:-translate-x-1/2"
              onKeyDown={handleKeyDown}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search size={18} className="shrink-0 text-text-muted" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder="Search or jump to..."
                  className="flex-1 bg-transparent text-lg text-text-primary placeholder:text-text-muted outline-none"
                  autoFocus
                />
              </div>

              {/* Results — max-h-[50vh] on mobile keeps list within screen even
                  with virtual keyboard open; sm+ allows taller list */}
              <div
                ref={listRef}
                className="max-h-[50vh] overflow-y-auto sm:max-h-[360px]"
                role="listbox"
              >
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">
                    No results for &apos;{query}&apos;
                  </div>
                ) : (
                  filtered.map((action, idx) => {
                    const Icon = action.icon;
                    const isActive = action.id === currentAction?.id;
                    return (
                      <div
                        key={action.id}
                        role="option"
                        aria-selected={isActive}
                        /* py-3 keeps touch target at ~44px for typical font sizes */
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${
                          isActive ? "bg-accent-muted" : ""
                        }`}
                        onClick={() => execute(action)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        {Icon && (
                          <Icon
                            size={18}
                            className="shrink-0 text-text-secondary"
                          />
                        )}
                        <span className="flex-1 text-sm text-text-primary">
                          {action.label}
                        </span>
                        {/* Keyboard shortcut badges hidden on mobile — irrelevant for touch */}
                        {action.shortcut && (
                          <span className="hidden items-center gap-1 sm:flex">
                            {action.shortcut.split(" ").map((k, i) => (
                              <kbd
                                key={i}
                                className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-medium text-text-secondary"
                              >
                                {k}
                              </kbd>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer hint — keyboard-only instructions hidden on touch devices */}
              <div className="hidden border-t border-border px-4 py-2 sm:flex sm:gap-4 sm:text-xs sm:text-text-muted">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>esc Close</span>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Shortcuts help modal */}
      <ShortcutsHelp
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </CommandPaletteContext.Provider>
  );
}
