"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type DropdownItem = {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "danger" | "default";
};

export function Dropdown({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    /* Close on outside click or touch — touchstart covers mobile browsers
       that don't reliably fire mousedown on outside taps */
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={ref} className="relative inline-flex">
      {/* Use a button wrapper so the trigger is keyboard-accessible */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex"
      >
        {trigger}
      </button>

      {open && (
        /* max-h + overflow-y-auto prevents the menu from exceeding viewport height.
           right-0 aligns to the trigger's right edge; this is correct for triggers
           near the right edge. For left-edge triggers the menu stays within the
           viewport because w-full at small sizes fills available space. */
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[180px] max-h-[60vh] overflow-y-auto animate-fade-in rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                /* py-2.5 brings touch target close to 44px for typical text sizes */
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                  item.variant === "danger"
                    ? "text-danger hover:bg-danger-muted"
                    : "text-text-secondary hover:bg-surface-2"
                }`}
              >
                {Icon && <Icon size={15} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
