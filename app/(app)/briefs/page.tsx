import { MeetingBriefs } from "@/components/MeetingBriefs";

export const metadata = { title: "Meeting Briefs — Omni Email" };

export default function BriefsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Meeting Briefs
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          AI-generated briefings before your calendar meetings — attendee context,
          recent email history, and suggested talking points.
        </p>
      </div>
      <div className="animate-slide-up">
        <MeetingBriefs />
      </div>
    </div>
  );
}
