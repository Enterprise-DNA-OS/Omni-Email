"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X, Zap, ChevronRight } from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { RunInboxModal } from "@/components/RunInboxModal";
import { navSections, type NavSection } from "@/lib/nav/navItems";
import { useNavBadges, badgeFor, badgeColorFor } from "@/hooks/useNavBadges";

export function MobileSidebar({
  open,
  onClose,
  userEmail,
  unreadCount,
}: {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const initial = userEmail.charAt(0).toUpperCase();
  const badges = useNavBadges();
  const [runInboxOpen, setRunInboxOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Section collapse state — default-collapsed sections start collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const section of navSections) {
      if (section.defaultCollapsed) defaults[section.id] = true;
    }
    return defaults;
  });

  function toggleSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Auto-expand section containing current route
  useEffect(() => {
    for (const section of navSections) {
      if (section.alwaysOpen) continue;
      const isActive = section.items.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
      );
      if (isActive && collapsed[section.id]) {
        setCollapsed((prev) => ({ ...prev, [section.id]: false }));
      }
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  function renderSection(section: NavSection) {
    const isCollapsed = !section.alwaysOpen && collapsed[section.id];
    const sectionHasBadge = section.items.some(
      (item) => badgeFor(item.label, badges, unreadCount) !== null,
    );

    return (
      <div key={section.id}>
        {!section.alwaysOpen && (
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className="flex w-full items-center gap-1.5 px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
          >
            <ChevronRight
              size={12}
              className={`shrink-0 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
            />
            {section.label}
            {isCollapsed && sectionHasBadge && (
              <span className="ml-auto h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        )}

        {!isCollapsed && (
          <div className="space-y-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              const badge = badgeFor(label, badges, unreadCount);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors duration-150 ${
                    active
                      ? "bg-accent-muted text-accent"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                  {badge !== null && (
                    <span
                      className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${badgeColorFor(label)}`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={handleBackdropClick}
        onTouchStart={handleBackdropClick}
        aria-hidden
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(288px,85vw)] flex-col border-r border-border bg-surface-1 transition-transform duration-250 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Omni Email" width={28} height={28} className="rounded-lg" />
            <span className="text-base font-bold tracking-tight text-text-primary">
              Omni Email
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav with sections */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-2">
          {navSections.map(renderSection)}
        </nav>

        {/* User section */}
        <div className="shrink-0 border-t border-border px-3 py-3">
          <button
            type="button"
            onClick={() => setRunInboxOpen(true)}
            className="mb-1.5 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-text-primary"
          >
            <Zap size={18} strokeWidth={1.8} className="text-amber-500" />
            Run My Inbox
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
              {initial}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
              {userEmail}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>

      <RunInboxModal
        open={runInboxOpen}
        onClose={() => setRunInboxOpen(false)}
        onActivated={() => setRunInboxOpen(false)}
      />
    </>
  );
}
