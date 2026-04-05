import { Skeleton, SkeletonCard, SkeletonThreadRow } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-40 rounded" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="space-y-4">
        <SkeletonCard />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonThreadRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
