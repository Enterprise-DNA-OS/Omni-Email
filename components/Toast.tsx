"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle, AlertCircle, Info, Undo2, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "undo";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
};

type ToastContextValue = {
  show: (message: string, type?: ToastType, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const DEFAULT_DURATION_MS = 4000;
const ACTION_DURATION_MS = 10000;

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  undo: Undo2,
};

const styles: Record<ToastType, string> = {
  success: "border-success/30 bg-success-muted text-success",
  error: "border-danger/30 bg-danger-muted text-danger",
  info: "border-accent/30 bg-accent-muted text-accent",
  undo: "border-amber-400/40 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-500/30",
};

const actionButtonStyles: Record<ToastType, string> = {
  success: "text-success hover:text-success/80 border-success/40 hover:bg-success/10",
  error: "text-danger hover:text-danger/80 border-danger/40 hover:bg-danger/10",
  info: "text-accent hover:text-accent/80 border-accent/40 hover:bg-accent/10",
  undo: "text-amber-700 hover:text-amber-900 border-amber-400/50 hover:bg-amber-100 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-800/40",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback(
    (message: string, type: ToastType = "info", action?: ToastAction) => {
      const id = nextId++;
      const duration = action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS;
      setToasts((prev) => [...prev, { id, message, type, action }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Toast container
          Mobile: full-width strip anchored to bottom (above safe-area)
          Desktop (sm+): fixed top-right corner stack */}
      <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-auto">
        {toasts.slice(-3).map((toast) => {
          const Icon = icons[toast.type];
          return (
            <div
              key={toast.id}
              className={`animate-toast-enter flex w-full items-center gap-3 rounded-xl border px-4 py-3 shadow-md backdrop-blur-sm sm:max-w-sm ${styles[toast.type]}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="flex-1 text-sm font-medium">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss(toast.id);
                  }}
                  className={`ml-1 shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${actionButtonStyles[toast.type]}`}
                >
                  {toast.action.label}
                </button>
              )}
              {/* Dismiss button: min 44×44 touch target via p-2.5 */}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="ml-auto shrink-0 rounded-md p-2.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
