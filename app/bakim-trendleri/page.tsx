"use client";

import { useEffect, useMemo, useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import AppIcon from "@/components/ui/AppIcon";
import { cachedFetch } from "@/lib/apiCache";
import { engineSortKey } from "@/lib/status";
import MaintenanceTrendPanel, {
  durationMinutes,
  eventDate,
  uniqueMaintenanceEvents,
  type MaintenanceTrendRecord,
} from "../saat-gecmisi/_components/MaintenanceTrendPanel";

interface TrendEngine {
  _id: string;
  name: string;
  hours?: number;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 dk";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours} sa${rest ? ` ${rest} dk` : ""}` : `${rest} dk`;
}

function formatDate(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value) : "Tarih yok";
}

export default function BakimTrendleriPage() {
  const [engines, setEngines] = useState<TrendEngine[]>([]);
  const [selected, setSelected] = useState("");
  const [records, setRecords] = useState<MaintenanceTrendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    cachedFetch<TrendEngine[]>("/api/engines", 15_000)
      .then((data) => {
        if (!alive) return;
        const sorted = [...data].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
        setEngines(sorted);
        setSelected((current) => current || sorted[0]?._id || "");
      })
      .catch(() => { if (alive) setError("Motorlar yüklenemedi."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setRecordsLoading(true);
    setError("");
    fetch(`/api/records?engine_id=${encodeURIComponent(selected)}&limit=1000&sort=asc`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Bakım kayıtları yüklenemedi.");
        return await response.json() as MaintenanceTrendRecord[] | { records?: MaintenanceTrendRecord[] };
      })
      .then((data) => setRecords(Array.isArray(data) ? data : data.records || []))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setRecords([]);
        setError("Seçilen motorun bakım kayıtları yüklenemedi.");
      })
      .finally(() => { if (!controller.signal.aborted) setRecordsLoading(false); });
    return () => controller.abort();
  }, [selected]);

  const engine = engines.find((item) => item._id === selected);
  const events = useMemo(() => uniqueMaintenanceEvents(records), [records]);
  const totalMinutes = useMemo(() => events.reduce((sum, record) => sum + durationMinutes(record), 0), [events]);
  const averageMinutes = events.length ? totalMinutes / events.length : 0;
  const lastEvent = useMemo(() => [...events].sort((a, b) => (eventDate(b)?.getTime() || 0) - (eventDate(a)?.getTime() || 0))[0], [events]);
  const typeRows = useMemo(() => {
    const counts = new Map<string, { count: number; minutes: number }>();
    records.forEach((record) => {
      const type = record.type_label || "Diğer";
      const row = counts.get(type) || { count: 0, minutes: 0 };
      row.count += 1;
      row.minutes += durationMinutes(record);
      counts.set(type, row);
    });
    return [...counts.entries()].map(([type, row]) => ({ type, ...row })).sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 8);
  }, [records]);
  const maxTypeCount = Math.max(...typeRows.map((row) => row.count), 1);

  if (loading) {
    return <div><TopBar title="Bakım Trendleri" subtitle="Analiz ve takip" /><main className="px-4 py-4"><Skeleton className="mb-4 h-12 rounded-control" /><div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Skeleton className="h-24 rounded-control" /><Skeleton className="h-24 rounded-control" /><Skeleton className="h-24 rounded-control" /><Skeleton className="h-24 rounded-control" /></div><Skeleton className="h-72 rounded-card" /></main><BottomNav /></div>;
  }

  return (
    <div>
      <TopBar title="Bakım Trendleri" subtitle={engine ? `${engine.name} · Analiz ve takip` : "Analiz ve takip"} />
      <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-6">
        <header className="mb-4 rounded-card border border-amber/25 bg-gradient-to-br from-panel to-panel2 p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-amber"><AppIcon name="chart" size={17} /><span className="text-[10px] font-bold uppercase tracking-[0.16em]">Analiz ve takip</span></div>
              <h1 className="mt-1 font-display text-xl font-bold uppercase tracking-wide text-text md:text-2xl">Bakım davranışını görünür kılın</h1>
              <p className="mt-1 text-[11px] leading-5 text-muted">Bakım sıklığını, gerçek bakım süresini ve hangi bakım türlerinin daha çok tekrarlandığını tek ekranda takip edin. Aynı bakım grubundaki kayıtlar bir kez sayılır.</p>
            </div>
            <label className="block min-w-0 md:w-64" htmlFor="trend-engine"><span className="text-[10px] font-bold uppercase tracking-wide text-faint">Motor seçin</span><select id="trend-engine" value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-bg px-3 py-2.5 text-[12px] font-bold text-text outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20">{engines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          </div>
        </header>

        {error && <div className="mb-4 rounded-control border border-red/35 bg-red/10 px-3 py-2.5 text-[11px] font-semibold text-red" role="alert">{error}</div>}
        {recordsLoading ? <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-24 rounded-control" /><Skeleton className="h-24 rounded-control" /><Skeleton className="h-72 rounded-card md:col-span-2" /></div> : (
          <>
            <section aria-label="Bakım trend özeti" className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-control border border-border bg-panel p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Bakım olayı</div><div className="mt-1 font-mono text-2xl font-bold text-amber">{events.length}</div><div className="mt-0.5 text-[10px] text-muted">Gruplanmış gerçek olay</div></div>
              <div className="rounded-control border border-border bg-panel p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Toplam süre</div><div className="mt-1 font-mono text-2xl font-bold text-teal">{(totalMinutes / 60).toFixed(1)}<span className="text-sm"> sa</span></div><div className="mt-0.5 text-[10px] text-muted">Başlangıç-bitiş öncelikli</div></div>
              <div className="rounded-control border border-border bg-panel p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Ortalama bakım</div><div className="mt-1 font-mono text-2xl font-bold text-text">{formatDuration(averageMinutes)}</div><div className="mt-0.5 text-[10px] text-muted">Bakım olayı başına</div></div>
              <div className="rounded-control border border-border bg-panel p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-faint">Son bakım</div><div className="mt-1 truncate text-[13px] font-bold text-text">{lastEvent?.type_label || "—"}</div><div className="mt-0.5 truncate text-[10px] text-muted">{formatDate(lastEvent ? eventDate(lastEvent) : null)}</div></div>
            </section>

            <MaintenanceTrendPanel records={records} />

            <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-card border border-border bg-panel p-4">
                <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="font-display text-[13px] font-bold uppercase tracking-wide text-text">Bakım türü dağılımı</h2><p className="mt-1 text-[10px] text-faint">Hangi türlerin daha sık tekrarlandığı</p></div><AppIcon name="tool" size={17} className="text-amber" /></div>
                {typeRows.length ? <div className="flex flex-col gap-3">{typeRows.map((row) => <div key={row.type}><div className="mb-1 flex items-center justify-between gap-2 text-[11px]"><span className="truncate font-semibold text-muted">{row.type}</span><span className="flex-shrink-0 font-mono font-bold text-text">{row.count} kayıt</span></div><div className="h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-amber transition-all" style={{ width: `${(row.count / maxTypeCount) * 100}%` }} /></div><div className="mt-1 text-[9px] text-faint">{formatDuration(row.minutes)} kayıtlı süre</div></div>)}</div> : <p className="text-[11px] text-faint">Bu motor için bakım kaydı bulunamadı.</p>}
              </div>
              <div className="rounded-card border border-border bg-panel p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="font-display text-[13px] font-bold uppercase tracking-wide text-text">Son bakım olayları</h2><p className="mt-1 text-[10px] text-faint">Tarih ve gerçek süre sırasıyla</p></div><AppIcon name="records" size={17} className="text-teal" /></div>{events.length ? <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">{[...events].sort((a, b) => (eventDate(b)?.getTime() || 0) - (eventDate(a)?.getTime() || 0)).slice(0, 10).map((record, index) => <div key={record._id || `${record.type_label}-${index}`} className="rounded-control border border-border bg-panel2 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-bold text-text">{record.type_label || "Diğer"}</span><span className="flex-shrink-0 font-mono text-[10px] font-bold text-teal">{formatDuration(durationMinutes(record))}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-faint"><span>{formatDate(eventDate(record))}</span><span>{record.hour_at_completion ? `${record.hour_at_completion.toLocaleString("tr-TR")} sa` : "Saat bilgisi yok"}</span></div></div>)}</div> : <p className="text-[11px] text-faint">Henüz bakım olayı bulunamadı.</p>}</div>
            </section>

            <div className="mt-4 rounded-control border border-teal/20 bg-teal/5 px-3 py-2.5 text-[10px] leading-4 text-muted"><span className="font-bold text-teal">Hesaplama notu:</span> Toplam süre aynı <code className="text-text">group_id</code> altındaki kayıtları tek bakım olayı sayar. Süre için önce başlangıç-bitiş farkı, sonra baş sorumlu teknisyen süresi, son olarak kayıtlı süre kullanılır.</div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
