import AppIcon from "@/components/ui/AppIcon";

export interface MaintenanceTrendRecord {
  _id?: string;
  type_label?: string;
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  duration_minutes?: number;
  created_at?: string | Date;
  group_id?: string;
  technician_contributions?: Array<{ contribution_role?: string; duration_minutes?: number }>;
  hour_at_completion?: number;
  status?: string;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function eventDate(record: MaintenanceTrendRecord): Date | null {
  const value = record.maintenance_start_at || record.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function durationMinutes(record: MaintenanceTrendRecord): number {
  if (record.maintenance_start_at && record.maintenance_end_at) {
    const start = new Date(record.maintenance_start_at).getTime();
    const end = new Date(record.maintenance_end_at).getTime();
    const calculated = (end - start) / 60_000;
    if (Number.isFinite(calculated) && calculated > 0 && calculated <= 366 * 24 * 60) return calculated;
  }
  const responsibleDuration = record.technician_contributions?.find((item) => item.contribution_role === "responsible")?.duration_minutes;
  if (Number.isFinite(Number(responsibleDuration)) && Number(responsibleDuration) > 0) return Number(responsibleDuration);
  const stored = Number(record.maintenance_duration_minutes ?? record.duration_minutes);
  return Number.isFinite(stored) && stored > 0 && stored <= 366 * 24 * 60 ? stored : 0;
}

export function uniqueMaintenanceEvents(records: MaintenanceTrendRecord[]): MaintenanceTrendRecord[] {
  const grouped = new Map<string, MaintenanceTrendRecord>();
  records.forEach((record) => {
    const key = record.group_id ? `group:${record.group_id}` : `record:${record._id || `${eventDate(record)?.toISOString() || "unknown"}:${record.type_label || "unknown"}`}`;
    if (!grouped.has(key)) grouped.set(key, record);
  });
  return [...grouped.values()];
}

function LineChart({ values, color, label, suffix = "" }: { values: number[]; color: string; label: string; suffix?: string }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${36 - (value / max) * 28}`).join(" ");
  return (
    <div className="rounded-control border border-border bg-panel2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color }}>{Math.max(...values).toLocaleString("tr-TR")}{suffix}</span>
      </div>
      <svg viewBox="0 0 100 40" className="mt-2 h-20 w-full overflow-visible" role="img" aria-label={`${label} trend grafiği`} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => <circle key={index} cx={(index / Math.max(values.length - 1, 1)) * 100} cy={36 - (value / max) * 28} r="1.4" fill={color} />)}
      </svg>
      <div className="mt-1 grid grid-cols-6 gap-1 text-center text-[8px] text-faint">{values.slice(-6).map((_, index) => <span key={index}>{formatMonth(monthKey(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5 + index, 1))))}</span>)}</div>
    </div>
  );
}

export default function MaintenanceTrendPanel({ records }: { records: MaintenanceTrendRecord[] }) {
  const now = new Date();
  const keys = Array.from({ length: 6 }, (_, index) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1))));
  const events = uniqueMaintenanceEvents(records);
  const counts = keys.map((key) => events.filter((record) => { const date = eventDate(record); return date && monthKey(date) === key; }).length);
  const durations = keys.map((key) => events.filter((record) => { const date = eventDate(record); return date && monthKey(date) === key; }).reduce((sum, record) => sum + durationMinutes(record), 0) / 60);
  const totalHours = events.reduce((sum, record) => sum + durationMinutes(record), 0) / 60;
  const types = new Map<string, number>();
  records.forEach((record) => types.set(record.type_label || "Diğer", (types.get(record.type_label || "Diğer") || 0) + 1));
  const topTypes = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <section className="mt-4 rounded-card border border-border bg-panel p-3 md:p-4" aria-labelledby="maintenance-trend-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber"><AppIcon name="chart" size={16} /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Bakım trendleri</span></div>
          <h2 id="maintenance-trend-heading" className="mt-1 text-[14px] font-bold text-text">Motorun bakım davranışı</h2>
          <p className="mt-1 text-[10.5px] leading-4 text-muted">Son altı aydaki bakım sıklığı ve bakımda geçen toplam süre.</p>
        </div>
        <div className="rounded-lg border border-teal/30 bg-teal/10 px-2.5 py-2 text-right"><div className="text-[9px] text-faint">Toplam süre</div><div className="font-mono text-[13px] font-bold text-teal">{totalHours.toFixed(1)} sa</div></div>
      </div>
      {records.length === 0 ? <div className="mt-3 rounded-lg border border-border bg-panel2 px-3 py-4 text-center text-[11px] text-muted">Bu motor için bakım kaydı bulunamadı.</div> : <>
        <div className="mt-3 grid gap-2 md:grid-cols-2"><LineChart values={counts} color="#e8952f" label="Aylık bakım sayısı" /><LineChart values={durations} color="#3fb5c4" label="Bakım süresi" suffix=" sa" /></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{topTypes.map(([type, count]) => <div key={type} className="rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="truncate text-[9.5px] text-faint">{type}</div><div className="mt-1 font-mono text-[13px] font-bold text-text">{count} <span className="text-[9px] font-normal text-muted">kayıt</span></div></div>)}</div>
      </>}
    </section>
  );
}
