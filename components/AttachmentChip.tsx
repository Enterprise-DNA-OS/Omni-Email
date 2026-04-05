"use client";

import { X, FileText, Image, FileArchive, FileSpreadsheet, FileCode } from "lucide-react";

interface AttachmentChipProps {
  file: File;
  onRemove: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith("image/")) return <Image size={12} />;
  if (mimeType.startsWith("text/")) return <FileCode size={12} />;
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-tar"
  ) {
    return <FileArchive size={12} />;
  }
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) {
    return <FileSpreadsheet size={12} />;
  }
  return <FileText size={12} />;
}

export function AttachmentChip({ file, onRemove }: AttachmentChipProps) {
  const mimeType = file.type || "application/octet-stream";

  return (
    /* max-w-full on mobile so a single chip never overflows its flex container;
       cap at 220px on sm+ to preserve the compact appearance on wider screens */
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-2.5 pr-1 text-xs text-text-secondary transition-colors hover:border-accent/50 sm:max-w-[220px]">
      <span className="shrink-0 text-text-muted">{getMimeIcon(mimeType)}</span>
      <span className="min-w-0 truncate font-medium" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 text-text-muted">{formatFileSize(file.size)}</span>
      {/* Remove button: p-2 on mobile to reach ~44px tap surface; p-0.5 on sm+ */}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 shrink-0 rounded-full p-2 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger sm:p-0.5"
        aria-label={`Remove ${file.name}`}
      >
        <X size={11} />
      </button>
    </span>
  );
}
