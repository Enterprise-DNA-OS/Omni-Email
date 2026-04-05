import { WaitingOnView } from "@/components/WaitingOnView";

export const metadata = { title: "Waiting On — Omni Email" };

export default function WaitingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Waiting On
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Emails you sent that are still awaiting a reply. Send follow-ups or
          cancel tracking from here.
        </p>
      </div>
      <div className="animate-slide-up">
        <WaitingOnView />
      </div>
    </div>
  );
}
