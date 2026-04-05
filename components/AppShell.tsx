"use client";

import { useState } from "react";
import { SidebarNav } from "@/components/SidebarNav";
import { MobileHeader } from "@/components/MobileHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { ComposeButton } from "@/components/ComposeButton";

interface AppShellProps {
  userEmail: string;
  children: React.ReactNode;
}

export function AppShell({ userEmail, children }: AppShellProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface-0">
      <MobileHeader userEmail={userEmail} />
      <div className="flex min-h-0 flex-1">
        <SidebarNav
          userEmail={userEmail}
          onChatToggle={() => setChatOpen((v) => !v)}
          chatOpen={chatOpen}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>
      <ComposeButton variant="fab" />
    </div>
  );
}
