import { ScheduledView } from "@/components/ScheduledView";

export const metadata = { title: "Scheduled — Omni Email" };

export default function ScheduledPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-surface-1 px-6 py-4">
        <h1 className="text-lg font-bold text-text-primary">Scheduled</h1>
        <p className="mt-0.5 text-sm text-text-muted">Messages queued to send at a later time</p>
      </div>
      <div className="flex-1 overflow-auto">
        <ScheduledView />
      </div>
    </div>
  );
}
