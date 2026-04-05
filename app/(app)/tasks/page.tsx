import { TasksView } from "@/components/TasksView";

export const metadata = { title: "Tasks — Omni Email" };

export default function TasksPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Tasks
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Action items extracted from your emails, plus tasks you add manually.
        </p>
      </div>
      <div className="animate-slide-up">
        <TasksView />
      </div>
    </div>
  );
}
