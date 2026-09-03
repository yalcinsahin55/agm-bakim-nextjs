export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur-md border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-panel border border-border animate-pulse" />
          <div className="flex-1">
            <div className="h-5 w-40 rounded bg-panel2 animate-pulse" />
            <div className="h-3 w-24 rounded bg-panel2 animate-pulse mt-1.5" />
          </div>
        </div>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="h-12 w-full rounded-xl bg-panel2 animate-pulse" />
        <div className="h-24 w-full rounded-card bg-panel animate-pulse" />
        <div className="h-24 w-full rounded-card bg-panel animate-pulse" />
        <div className="h-24 w-full rounded-card bg-panel animate-pulse" />
      </div>
    </div>
  );
}
