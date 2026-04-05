"use client";

import { useState } from "react";
import { PenSquare } from "lucide-react";
import { ComposeModal } from "@/components/ComposeModal";

export function ComposeButton({ variant }: { variant: "sidebar" | "fab" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
        >
          <PenSquare size={16} />
          Compose
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Compose new email"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl lg:hidden"
        >
          <PenSquare size={22} />
        </button>
      )}
      <ComposeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
