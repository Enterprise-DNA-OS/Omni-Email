"use client";

import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcut handler.
 *
 * Supports:
 * - Single keys: "e", "/", "?", "Escape"
 * - Modifier combos: "mod+k" (Cmd on Mac, Ctrl on Windows/Linux)
 * - Two-key sequences: "g i", "g c", "g s" (press first key, then second within 1s)
 *
 * Ignores keypresses when the target is an input, textarea, select,
 * or contenteditable element.
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  enabled: boolean = true
): void {
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function isMac(): boolean {
      if (typeof navigator === "undefined") return false;
      // navigator.platform is deprecated but widely supported;
      // fall back to userAgentData or userAgent
      if (navigator.platform) {
        return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      }
      return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    }

    const mac = isMac();

    function handler(e: KeyboardEvent) {
      // Ignore when typing in form elements or contenteditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      // Build the key representation for modifier combos
      const mod = mac ? e.metaKey : e.ctrlKey;
      const key = e.key;

      // Check modifier combos first (e.g. "mod+k")
      if (mod && !e.altKey) {
        const combo = `mod+${key.toLowerCase()}`;
        if (combo in shortcuts) {
          e.preventDefault();
          shortcuts[combo]();
          // Clear any pending sequence
          pendingRef.current = null;
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          return;
        }
      }

      // Don't process single/sequence keys when a modifier is held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Check two-key sequences
      if (pendingRef.current !== null) {
        const sequence = `${pendingRef.current} ${key.toLowerCase()}`;
        pendingRef.current = null;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (sequence in shortcuts) {
          e.preventDefault();
          shortcuts[sequence]();
          return;
        }
      }

      // Check if this key starts a sequence
      const startsSequence = Object.keys(shortcuts).some(
        (s) => s.includes(" ") && s.startsWith(`${key.toLowerCase()} `)
      );

      if (startsSequence) {
        pendingRef.current = key.toLowerCase();
        timerRef.current = setTimeout(() => {
          pendingRef.current = null;
          timerRef.current = null;
        }, 1000);
        return;
      }

      // Check single key shortcuts
      const singleKey = key === "Escape" ? "Escape" : key;
      if (singleKey in shortcuts) {
        e.preventDefault();
        shortcuts[singleKey]();
        return;
      }
    }

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [shortcuts, enabled]);
}
