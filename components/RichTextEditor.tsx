"use client";

import { useRef, useCallback, useEffect } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Undo2, Redo2 } from "lucide-react";

type Props = {
  /** HTML content */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
};

function ToolbarBtn({
  icon: Icon,
  cmd,
  arg,
  title,
}: {
  icon: typeof Bold;
  cmd: string;
  arg?: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      /* onPointerDown is used instead of onMouseDown alone because
         onPointerDown fires reliably on both iOS Safari and Android Chrome
         before the editor loses focus, allowing execCommand to work correctly.
         p-2.5 on mobile (≥44px touch target), p-1.5 on sm+ */
      onPointerDown={(e) => {
        e.preventDefault(); // keep focus in editor
        document.execCommand(cmd, false, arg);
      }}
      className="rounded p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary sm:p-1.5"
    >
      <Icon size={15} />
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder, minRows = 6 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef(value);

  // Sync external value changes (e.g. AI insert, draft restore)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== internalRef.current) {
      internalRef.current = value;
      el.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    // Treat empty editor (just <br> or empty divs) as empty string
    const isEmpty = !el.textContent?.trim() && !el.querySelector("img");
    const clean = isEmpty ? "" : html;
    internalRef.current = clean;
    onChange(clean);
  }, [onChange]);

  const handleLink = useCallback(() => {
    const url = prompt("Enter URL:");
    if (url) {
      document.execCommand("createLink", false, url);
    }
  }, []);

  const minHeight = `${minRows * 1.625}rem`;

  return (
    <div className="rounded-lg border border-border bg-surface-0 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border-muted px-2 py-1">
        <ToolbarBtn icon={Bold} cmd="bold" title="Bold" />
        <ToolbarBtn icon={Italic} cmd="italic" title="Italic" />
        <ToolbarBtn icon={Underline} cmd="underline" title="Underline" />
        <div className="mx-1 h-4 w-px bg-border-muted" />
        <ToolbarBtn icon={List} cmd="insertUnorderedList" title="Bullet list" />
        <ToolbarBtn icon={ListOrdered} cmd="insertOrderedList" title="Numbered list" />
        <div className="mx-1 h-4 w-px bg-border-muted" />
        {/* p-2.5 on mobile for 44px touch target, p-1.5 on sm+ */}
        <button
          type="button"
          title="Insert link"
          aria-label="Insert link"
          onPointerDown={(e) => {
            e.preventDefault();
            handleLink();
          }}
          className="rounded p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary sm:p-1.5"
        >
          <Link2 size={15} />
        </button>
        <div className="mx-1 h-4 w-px bg-border-muted" />
        <ToolbarBtn icon={Undo2} cmd="undo" title="Undo" />
        <ToolbarBtn icon={Redo2} cmd="redo" title="Redo" />
      </div>

      {/* Editor area */}
      {/* autoCapitalize / autoCorrect / spellCheck ensure consistent behaviour
          across iOS Safari and Android Chrome in the contenteditable editor */}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        data-placeholder={placeholder ?? "Write your message..."}
        onInput={handleInput}
        onBlur={handleInput}
        className="rich-editor min-h-[var(--min-h)] w-full px-3 py-2 text-sm leading-relaxed text-text-primary focus:outline-none empty:before:pointer-events-none empty:before:text-text-muted empty:before:content-[attr(data-placeholder)]"
        style={{ "--min-h": minHeight } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: value }}
        suppressContentEditableWarning
      />
    </div>
  );
}

/** Extract plain text from HTML for APIs that need bodyText */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent ?? "";
  }
  // Fallback: strip tags
  return html.replace(/<[^>]*>/g, "");
}
