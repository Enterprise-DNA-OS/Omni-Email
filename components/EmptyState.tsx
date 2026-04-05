import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-2xl bg-surface-2 p-4">
        <Icon size={32} className="text-text-muted" strokeWidth={1.5} />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mb-5 max-w-xs text-sm text-text-muted">{description}</p>
      {action}
    </div>
  );
}
