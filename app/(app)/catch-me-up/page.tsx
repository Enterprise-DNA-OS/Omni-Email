import { CatchMeUp } from "@/components/CatchMeUp";

export const metadata = { title: "Catch Me Up — Omni Email" };

export default function CatchMeUpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Catch Me Up
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Your AI-curated briefing — urgent items, important updates, and
          everything your AI handled while you were away.
        </p>
      </div>
      <div className="animate-slide-up">
        <CatchMeUp />
      </div>
    </div>
  );
}
