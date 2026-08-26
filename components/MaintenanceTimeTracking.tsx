"use client";

import { formatMaintenanceDuration } from "@/lib/maintenanceTime";

interface MaintenanceTimeTrackingProps {
  maintenanceStartAt: string;
  maintenanceEndAt: string;
  timeTrackingReady: boolean;
  maintenanceDurationMinutes: number | null;
  showPressure: boolean;
  pressure: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onPressureChange: (value: string) => void;
}

export default function MaintenanceTimeTracking({
  maintenanceStartAt,
  maintenanceEndAt,
  timeTrackingReady,
  maintenanceDurationMinutes,
  showPressure,
  pressure,
  onStartChange,
  onEndChange,
  onPressureChange,
}: MaintenanceTimeTrackingProps) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="time-tracking-heading">
      <div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">02 · Zaman takibi</div><h2 id="time-tracking-heading" className="mt-1 text-base font-extrabold text-text">Başlangıç ve bitiş</h2></div><span className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9px] font-bold text-faint">ZORUNLU</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[10.5px] font-bold text-muted">Başlangıç
          <input required type="datetime-local" value={maintenanceStartAt} max={maintenanceEndAt || undefined} onChange={(event) => onStartChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2.5 text-sm font-mono text-text outline-none focus:border-amber" />
        </label>
        <label className="text-[10.5px] font-bold text-muted">Bitiş
          <input required type="datetime-local" value={maintenanceEndAt} min={maintenanceStartAt || undefined} onChange={(event) => onEndChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2.5 text-sm font-mono text-text outline-none focus:border-amber" />
        </label>
      </div>
      <div className={`mt-3 rounded-xl border px-3 py-3 ${timeTrackingReady ? "border-green/30 bg-green/10 text-green" : "border-red/30 bg-red/10 text-red"}`} role="status"><div className="text-[10px] font-bold uppercase tracking-wide">{timeTrackingReady ? "Toplam bakım süresi" : "Zaman bilgisi eksik"}</div><div className="mt-1 text-lg font-extrabold">{timeTrackingReady ? formatMaintenanceDuration(maintenanceDurationMinutes) : "Geçerli başlangıç ve bitiş girin"}</div><div className="mt-1 text-[10px] text-muted">Bakım birden fazla gün sürebilir; gerçek tarih-saatleri seçin.</div></div>
      {showPressure && <div className="mt-3 rounded-xl border border-teal/30 bg-teal/5 p-3"><label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Fark basıncı (bar)
        <input type="number" step="0.1" value={pressure} onChange={(event) => onPressureChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm font-mono text-teal outline-none focus:border-teal" />
      </label></div>}
    </section>
  );
}

export type { MaintenanceTimeTrackingProps };
