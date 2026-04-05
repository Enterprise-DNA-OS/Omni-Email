import { RulesList } from "@/components/RulesList";

export const metadata = { title: "Rules — Omni Email" };

export default function RulesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Automation Rules
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Create rules to automatically organize and act on incoming emails.
        </p>
      </div>
      <div className="animate-slide-up">
        <RulesList />
      </div>
    </div>
  );
}
