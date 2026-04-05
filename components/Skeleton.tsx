export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-skeleton rounded-md bg-surface-3 ${className}`}
    />
  );
}

export function SkeletonThreadRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/5 rounded" />
        <Skeleton className="h-3 w-4/5 rounded" />
      </div>
      <Skeleton className="h-3 w-16 shrink-0 rounded" />
    </div>
  );
}

export function SkeletonCalendarDay() {
  return (
    <div className="min-h-44 rounded-xl border border-border bg-surface-1 p-3">
      <Skeleton className="mb-3 h-3 w-16 rounded" />
      <div className="space-y-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6">
      <Skeleton className="mb-4 h-5 w-40 rounded" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-3/4 rounded-lg" />
      </div>
    </div>
  );
}
