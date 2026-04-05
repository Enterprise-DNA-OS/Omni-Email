import { InboxHealthDashboard } from "@/components/InboxHealthDashboard";

export const metadata = { title: "Analytics — Omni Email" };

export default function AnalyticsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Inbox Analytics
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Response times, automation rates, email volume, and usage patterns.
        </p>
      </div>
      <div className="animate-slide-up">
        <InboxHealthDashboard />
      </div>
    </div>
  );
}
