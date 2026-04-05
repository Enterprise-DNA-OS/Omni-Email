import { AlertsView } from "@/components/AlertsView";

export const metadata = { title: "Alerts — Omni Email" };

export default function AlertsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-surface-1 px-6 py-4">
        <h1 className="text-lg font-bold text-text-primary">Alerts</h1>
        <p className="mt-0.5 text-sm text-text-muted">AI-detected risks and opportunities in your inbox</p>
      </div>
      <AlertsView />
    </div>
  );
}
