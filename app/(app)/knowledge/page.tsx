import { KnowledgeBase } from "@/components/KnowledgeBase";

export const metadata = { title: "Knowledge Base — Omni Email" };

export default function KnowledgePage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Facts, preferences, procedures, and snippets the AI uses when drafting replies for you.
        </p>
      </div>
      <div className="animate-slide-up">
        <KnowledgeBase />
      </div>
    </div>
  );
}
