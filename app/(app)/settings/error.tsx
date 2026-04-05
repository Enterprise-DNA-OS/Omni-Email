"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings] page error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-2xl bg-danger-muted p-4">
        <AlertCircle size={32} className="text-danger" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">
        Settings failed to load
      </h2>
      <p className="text-sm text-text-muted">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
      >
        <RefreshCw size={15} />
        Try again
      </button>
    </div>
  );
}
