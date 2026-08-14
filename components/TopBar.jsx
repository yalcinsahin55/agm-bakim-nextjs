export default function TopBar({ title, subtitle, right }) {
  return (
    <div className="sticky top-0 z-20 bg-[#0f1319]/95 backdrop-blur-md border-b border-border px-4 pt-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold uppercase tracking-wide truncate">{title}</div>
          {subtitle && <div className="text-[10.5px] text-faint mt-1">{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}
