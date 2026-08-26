import { Skeleton } from "@/components/ui/Skeleton";

export default function MemoryLoading() {
  return (
    <div className="pb-24">
      <Skeleton className="aspect-4/5 w-full rounded-none sm:aspect-video" />
      <div className="relative -mt-6 rounded-t-lg bg-surface px-4 pt-6">
        <div className="mx-auto max-w-2xl">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="mt-2 h-4 w-40" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-4/5" />
          <div className="mt-8 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
