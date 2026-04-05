"use client";

import { useCallback, useState } from "react";
import { Menu } from "lucide-react";
import { MobileSidebar } from "@/components/MobileSidebar";

export function MobileHeader({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  const initial = userEmail.charAt(0).toUpperCase();

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-2"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-bold text-text-primary">Omni Email</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
          {initial}
        </div>
      </header>
      <MobileSidebar open={open} onClose={handleClose} userEmail={userEmail} />
    </>
  );
}
