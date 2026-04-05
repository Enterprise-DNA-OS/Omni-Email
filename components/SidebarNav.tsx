"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessageSquare, Zap, ChevronRight } from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { ComposeButton } from "@/components/ComposeButton";
import { RunInboxModal } from "@/components/RunInboxModal";
import { useState, useEffect } from "react";
import { navSections, type NavSection } from "@/lib/nav/navItems";
import { useNavBadges, badgeFor, badgeColorFor } from "@/hooks/useNavBadges";

const COLLAPSED_KEY = "omni-nav-collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveCollapsed(state: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state));
  } catch { /* quota */ }
}

export function SidebarNav({
  userEmail,
  unreadCount,
  onChatToggle,
  chatOpen,
}: {
  userEmail: string;
  unreadCount?: number;
  onChatToggle?: () => void;
  chatOpen?: boolean;
}) {
  const pathname = usePathname();
  const initial = userEmail.charAt(0).toUpperCase();
  const badges = useNavBadges();
  const [runInboxOpen, setRunInboxOpen] = useState(false);

  // Collapsed state per section, persisted to localStorage
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const section of navSections) {
      if (section.defaultCollapsed) defaults[section.id] = true;
    }
    return defaults;
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadCollapsed();
    if (Object.keys(saved).length > 0) {
      setCollapsed((prev) => ({ ...prev, ...saved }));
    }
  }, []);

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  }

  // Auto-expand a section if the current route is inside it
  useEffect(() => {
    for (const section of navSections) {
      if (section.alwaysOpen) continue;
      const isActive = section.items.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
      );
      if (isActive && collapsed[section.id]) {
        setCollapsed((prev) => {
          const next = { ...prev, [section.id]: false };
          saveCollapsed(next);
          return next;
        });
      }
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function renderSection(section: NavSection) {
    const isCollapsed = !section.alwaysOpen && collapsed[section.id];
    const sectionHasBadge = section.items.some(
      (item) => badgeFor(item.label, badges, unreadCount) !== null,
    );

    return (
      <div key={section.id}>
        {/* Section header — only for non-alwaysOpen sections */}
        {!section.alwaysOpen && (
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className="flex w-full items-center gap-1.5 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
          >
            <ChevronRight
              size={12}
              className={`shrink-0 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
            />
            {section.label}
            {/* Show dot indicator when section is collapsed but has badges */}
            {isCollapsed && sectionHasBadge && (
              <span className="ml-auto h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        )}

        {/* Items */}
        {!isCollapsed && (
          <div className="space-y-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              const badge = badgeFor(label, badges, unreadCount);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                    active
                      ? "bg-accent-muted text-accent"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
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
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface-1 lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img src="/logo.png" alt="Omni Email" width={28} height={28} className="rounded-lg" />
        <span className="text-base font-bold tracking-tight text-text-primary">
          Omni Email
        </span>
      </div>

      {/* Compose */}
      <div className="px-3 mb-1">
        <ComposeButton variant="sidebar" />
      </div>

      {/* Navigation with sections */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {navSections.map(renderSection)}
      </nav>

      {/* User section */}
      <div className="border-t border-border px-3 py-3">
        {/* Run My Inbox quick-activate */}
        <button
          type="button"
          onClick={() => setRunInboxOpen(true)}
          className="mb-1.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-text-primary"
          title="Activate Run My Inbox"
        >
          <Zap size={17} strokeWidth={1.8} className="text-amber-500" />
          Run My Inbox
        </button>

        {/* Chat toggle */}
        {onChatToggle && (
          <button
            type="button"
            onClick={onChatToggle}
            className={`mb-1.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              chatOpen
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            }`}
          >
            <MessageSquare size={17} strokeWidth={chatOpen ? 2.2 : 1.8} />
            Chat with Inbox
          </button>
        )}

        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-secondary">
              {userEmail}
            </span>
            {badges.currentMode && badges.currentMode !== "default" && (
              <span className="inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium capitalize text-text-muted">
                {badges.currentMode.replace("_", " ")} mode
              </span>
            )}
          </div>
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

      <RunInboxModal
        open={runInboxOpen}
        onClose={() => setRunInboxOpen(false)}
        onActivated={() => setRunInboxOpen(false)}
      />
    </aside>
  );
}
