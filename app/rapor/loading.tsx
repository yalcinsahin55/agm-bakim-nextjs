import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div>
      <div className="sticky top-0 z-20 bg-[#0f1319]/95 backdrop-blur-md border-b border-border px-4 pt-4 pb-3">
        <Skeleton className="h-5 w-40 rounded" />
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    </div>
  );
}
