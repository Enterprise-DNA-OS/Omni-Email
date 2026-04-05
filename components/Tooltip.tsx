"use client";

import { useState, useRef, type ReactNode } from "react";

const positions = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
} as const;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: string;
  children: ReactNode;
  side?: keyof typeof positions;
}) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);

  const show = () => {
    timeout.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    if (timeout.current) clearTimeout(timeout.current);
    setVisible(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          className={`pointer-events-none absolute z-50 animate-fade-in whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md ${positions[side]}`}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  );
}
