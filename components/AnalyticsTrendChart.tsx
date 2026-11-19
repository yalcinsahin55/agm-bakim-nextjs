interface TrendPoint {
  label: string;
  value: number;
}

export default function AnalyticsTrendChart({ points }: { points: TrendPoint[] }) {
  const visiblePoints = points.slice(-8);
  const max = Math.max(...visiblePoints.map((point) => point.value), 1);

  return (
    <div className="ui-card p-4 md:p-5" aria-label="Aylık bakım trendi">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="app-kicker text-teal">Trend görünümü</div>
          <h2 className="app-section-title mt-1 text-lg">Bakım hareketi</h2>
        </div>
        <div className="text-right text-[10px] text-faint"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal" />Tamamlanan kayıtlar</div>
      </div>
      {visiblePoints.length ? (
        <div className="flex h-44 items-end gap-2 sm:gap-3">
          {visiblePoints.map((point) => (
            <div key={point.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="font-mono text-[10px] font-bold text-text opacity-0 transition-opacity group-hover:opacity-100">{point.value}</span>
              <div className="relative flex h-28 w-full items-end overflow-hidden rounded-t-lg bg-panel2">
                <div className="w-full rounded-t-lg bg-gradient-to-t from-teal/60 to-teal transition-all duration-300 group-hover:from-amber/70 group-hover:to-amber" style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }} />
              </div>
              <span className="max-w-full truncate text-[9px] text-faint">{point.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center rounded-control border border-dashed border-border bg-panel2/60 text-[11px] text-muted">Trend oluşturmak için henüz yeterli kayıt yok.</div>
      )}
    </div>
  );
}
