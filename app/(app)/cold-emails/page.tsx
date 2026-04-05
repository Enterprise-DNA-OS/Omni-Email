import { ColdEmailBlocker } from "@/components/ColdEmailBlocker";

export const metadata = { title: "Cold Email Blocker — Omni Email" };

export default function ColdEmailsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Cold Email Blocker
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          AI-powered detection and blocking of unsolicited cold outreach emails.
        </p>
      </div>
      <div className="animate-slide-up">
        <ColdEmailBlocker />
      </div>
    </div>
  );
}
