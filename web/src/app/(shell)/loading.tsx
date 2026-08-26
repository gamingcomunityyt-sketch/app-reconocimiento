import { Skeleton, SkeletonGrid } from "@/components/ui/Skeleton";

export default function LibraryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="pt-2">
        <Skeleton className="h-8 w-44" />
      </div>
      <Skeleton className="mt-4 h-11 w-full rounded-full" />
      <div className="mt-5 pb-32">
        <SkeletonGrid count={6} />
      </div>
    </div>
  );
}
