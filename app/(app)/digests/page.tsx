import { DigestManager } from "@/components/DigestManager";

export const metadata = { title: "Digests — Omni Email" };

export default function DigestsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Digests
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Schedule AI-summarized email roundups — filtered by category, tag, or
          sender — delivered on your timetable.
        </p>
      </div>
      <div className="animate-slide-up">
        <DigestManager />
      </div>
    </div>
  );
}
