import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28 rounded" />
        <Skeleton className="h-8 w-2/3 rounded" />
      </div>

      <div className="rounded-xl border border-border bg-surface-1 p-5 shadow-xs">
        <div className="mb-3 flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-1 shadow-xs">
          <div className="flex items-center gap-3 border-b border-border-muted px-5 py-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="ml-auto h-3 w-24 rounded" />
          </div>
          <div className="space-y-3 px-5 py-4">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
