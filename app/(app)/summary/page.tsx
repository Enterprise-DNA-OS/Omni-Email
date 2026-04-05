import { DailySummary } from "@/components/DailySummary";

export const metadata = { title: "Daily Summary — Omni Email" };

export default function SummaryPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Daily Summary
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Your AI-powered executive briefing — important threads, action items,
          and overnight activity.
        </p>
      </div>
      <div className="animate-slide-up">
        <DailySummary />
      </div>
    </div>
  );
}
