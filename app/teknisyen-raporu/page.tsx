"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";
import { formatMaintenanceDuration } from "@/lib/maintenanceTime";

const PERIODS = [
  { key: "month", label: "Bu ay" },
  { key: "3months", label: "Son 3 ay" },
  { key: "year", label: "Bu yıl" },
  { key: "all", label: "Tümü" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

type TechnicianRow = {
  technician_id: string;
  technician: string;
  technician_type?: "mekanik" | "elektromekanik";
  technician_type_label?: string;
  responsible_count: number;
  support_count: number;
  total_count: number;
  responsible_duration_minutes: number;
  support_duration_minutes: number;
  total_duration_minutes: number;
  average_duration_minutes: number;
};

type TechnicianTypeRow = {
  technician_type: "mekanik" | "elektromekanik";
  technician_type_label: string;
  technician_count: number;
  responsible_count: number;
  support_count: number;
  total_count: number;
  total_duration_minutes: number;
};

type AnalyticsResponse = {
  total: number;
  periodTotal?: number;
  periodDurationMinutes?: number;
  periodTechnicianDurationMinutes?: number;
  periodMissingDuration?: number;
  periodTechnicianTasks?: number;
  thisCount: number;
  lastCount: number;
  byType: Array<{ type: string; count: number }>;
  byEngine: Array<{ engine_id: string | null; engine: string; count: number }>;
  byTechnician: TechnicianRow[];
  byTechnicianType: TechnicianTypeRow[];
};

const EMPTY: AnalyticsResponse = { total: 0, thisCount: 0, lastCount: 0, byType: [], byEngine: [], byTechnician: [], byTechnicianType: [] };

function StatCard({ label, value, hint, accent = "text-teal" }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return <div className="rounded-xl border border-border bg-panel p-3.5"><div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div><div className={`mt-1 font-mono text-xl font-bold ${accent}`}>{value}</div>{hint && <div className="mt-0.5 text-[9.5px] text-faint">{hint}</div>}</div>;
}

export default function TeknisyenRaporuPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [summary, setSummary] = useState<AnalyticsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(selectedPeriod: PeriodKey = period) {
    setError("");
    setLoading(true);
    try {
      const data = await cachedFetch<AnalyticsResponse>(`/api/analytics/summary?period=${selectedPeriod}`, 30_000);
      setSummary({
        ...EMPTY,
        ...data,
        total: Number(data.total || 0),
        thisCount: Number(data.thisCount || 0),
        lastCount: Number(data.lastCount || 0),
        byType: Array.isArray(data.byType) ? data.byType : [],
        byEngine: Array.isArray(data.byEngine) ? data.byEngine : [],
        byTechnician: Array.isArray(data.byTechnician) ? data.byTechnician : [],
        byTechnicianType: Array.isArray(data.byTechnicianType) ? data.byTechnicianType : [],
      });
    } catch (loadError) {
      if (loadError instanceof ApiFetchError && loadError.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent("/teknisyen-raporu")}`);
        return;
      }
      setError("Teknisyen raporu yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load("month"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDuration = Number(summary.periodTechnicianDurationMinutes ?? summary.periodDurationMinutes ?? 0);
  const totalTechnicianTasks = Number(summary.periodTechnicianTasks || 0);
  const averageDuration = totalTechnicianTasks ? Math.round(totalDuration / totalTechnicianTasks) : 0;
  const maxWork = Math.max(...summary.byTechnician.map((item) => Number(item.total_count || 0)), 1);
  const maxType = Math.max(...summary.byType.map((item) => Number(item.count || 0)), 1);
  const maxEngine = Math.max(...summary.byEngine.map((item) => Number(item.count || 0)), 1);

  if (loading && !summary.byTechnician.length) {
    return <div><TopBar title="Teknisyen Raporu" subtitle="Performans verileri yükleniyor..." /><div className="px-4 py-4"><div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div><Skeleton className="mb-4 h-72 rounded-card" /><Skeleton className="h-64 rounded-card" /></div><BottomNav /></div>;
  }

  return <div>
    <TopBar title="Teknisyen Raporu" subtitle="Bakım performansı ve çalışma süreleri" />
    <main className="px-4 py-4 pb-24">
      <section className="mb-4 rounded-card border border-border bg-panel p-3.5">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Rapor dönemi</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERIODS.map((item) => <button key={item.key} type="button" onClick={() => { setPeriod(item.key); void load(item.key); }} className={`rounded-lg border px-2.5 py-2 text-[11px] font-bold transition ${period === item.key ? "border-teal bg-teal/10 text-teal" : "border-border bg-panel2 text-muted hover:border-borderlt"}`}>{item.label}</button>)}
        </div>
      </section>

      {error && <div className="mb-4 rounded-card border border-red/40 bg-red/10 p-3 text-[11px] text-red" role="alert"><div className="font-bold">{error}</div><button type="button" onClick={() => void load()} className="mt-2 rounded-lg bg-red px-3 py-1.5 text-[11px] font-bold text-white">Tekrar dene</button></div>}

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Bakım kaydı" value={Number(summary.periodTotal || 0)} hint="Seçilen dönemde" accent="text-amber" />
        <StatCard label="Teknisyen görevi" value={totalTechnicianTasks} hint="Sorumlu + destek" accent="text-teal" />
        <StatCard label="Toplam çalışma" value={formatMaintenanceDuration(totalDuration)} hint="Teknisyen katkı süreleri" accent="text-green" />
        <StatCard label="Ortalama süre" value={formatMaintenanceDuration(averageDuration)} hint="Teknisyen görevi başına" accent="text-purple-400" />
      </section>

      {Number(summary.periodMissingDuration || 0) > 0 && <div className="mb-4 rounded-card border border-amber/40 bg-amber/10 p-3 text-[11px] text-amber" role="status"><div className="font-bold">{summary.periodMissingDuration} eski kayıtta süre bilgisi bulunmuyor.</div><div className="mt-0.5 text-[10px] text-muted">Bu kayıtlar geriye dönük uyumluluk için korunuyor; yeni kayıtlar başlangıç ve bitiş tarih-saatleriyle oluşturulacak.</div></div>}

      {summary.byTechnicianType.length > 0 && <section className="mb-4 rounded-card border border-border bg-panel p-4">
        <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-display text-[13px] font-bold uppercase tracking-wide">Teknisyen türü özeti</h2><span className="text-[10px] text-faint">Uzmanlık türüne göre</span></div>
        <p className="mb-3 text-[10.5px] text-faint">Mekanik ve elektromekanik ekiplerin görev sayısı ile kayıtlı süreleri ayrı tutulur. Elektromekanik çalışanlar destek olarak seçildiğinde katkıları kendi kategorilerinde görünür.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{summary.byTechnicianType.map((item) => <div key={item.technician_type} className="rounded-xl border border-border bg-panel2 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[11.5px] font-bold text-text">{item.technician_type_label}</span><span className="text-[10px] text-faint">{item.technician_count} kişi</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><div><div className="text-faint">Görev</div><div className="font-mono font-bold text-teal">{item.total_count}</div></div><div><div className="text-faint">Sorumlu</div><div className="font-mono font-bold text-amber">{item.responsible_count}</div></div><div><div className="text-faint">Destek</div><div className="font-mono font-bold text-purple-300">{item.support_count}</div></div></div><div className="mt-2 text-[10px] text-muted">Toplam süre: <b className="text-green">{formatMaintenanceDuration(item.total_duration_minutes)}</b> · Görev başına: <b>{formatMaintenanceDuration(item.total_count ? Math.round(item.total_duration_minutes / item.total_count) : 0)}</b></div></div>)}</div>
      </section>}

      <section className="mb-4 rounded-card border border-border bg-panel p-4">
        <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-display text-[13px] font-bold uppercase tracking-wide">Teknisyen çalışma özeti</h2><span className="text-[10px] text-faint">Yeşil: sorumlu · Sarı: destek</span></div>
        <p className="mb-4 text-[10.5px] text-faint">Her teknisyenin bakım sorumluluğu, ekip katkısı ve kayıtlı çalışma süresi birlikte gösterilir. Ekip bakımında aynı bakım süresi, seçilen her teknisyenin katkısına ayrı ayrı yansır.</p>
        {summary.byTechnician.length ? <div className="flex flex-col gap-4">{summary.byTechnician.map((item) => <div key={item.technician_id}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate font-semibold text-muted">{item.technician} <span className="ml-1 rounded-full border border-border px-1.5 py-0.5 text-[9px] font-normal text-faint">{item.technician_type_label || (item.technician_type === "elektromekanik" ? "Elektromekanik teknisyen" : "Mekanik teknisyen")}</span></span><span className="flex-shrink-0 font-mono font-bold text-text">{item.total_count} görev</span></div>
          <div className="flex h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-teal transition-all" style={{ width: `${(item.responsible_count / maxWork) * 100}%` }} /><div className="h-full bg-amber transition-all" style={{ width: `${(item.support_count / maxWork) * 100}%` }} /></div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] text-faint"><span>Sorumlu: {item.responsible_count}</span><span>Destek: {item.support_count}</span><span>Süre: {formatMaintenanceDuration(item.total_duration_minutes)}</span><span>Ort.: {formatMaintenanceDuration(item.average_duration_minutes)}</span></div>
        </div>)}</div> : <p className="text-[11px] text-faint">Bu dönem için teknisyen çalışma verisi bulunamadı.</p>}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-card border border-border bg-panel p-4"><h2 className="mb-3 font-display text-[13px] font-bold uppercase tracking-wide">Bakım türü dağılımı</h2>{summary.byType.length ? <div className="flex flex-col gap-2.5">{summary.byType.slice(0, 12).map((item) => <div key={item.type}><div className="mb-1 flex justify-between gap-2 text-[11px]"><span className="truncate text-muted">{item.type}</span><span className="font-mono font-bold text-text">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-amber" style={{ width: `${(item.count / maxType) * 100}%` }} /></div></div>)}</div> : <p className="text-[11px] text-faint">Veri yok.</p>}</section>
        <section className="rounded-card border border-border bg-panel p-4"><h2 className="mb-3 font-display text-[13px] font-bold uppercase tracking-wide">Motor dağılımı</h2>{summary.byEngine.length ? <div className="flex flex-col gap-2.5">{summary.byEngine.slice(0, 12).map((item) => <div key={item.engine_id || item.engine}><div className="mb-1 flex justify-between gap-2 text-[11px]"><span className="truncate text-muted">{item.engine}</span><span className="font-mono font-bold text-text">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-teal" style={{ width: `${(item.count / maxEngine) * 100}%` }} /></div></div>)}</div> : <p className="text-[11px] text-faint">Veri yok.</p>}</section>
      </div>
    </main>
    <BottomNav />
  </div>;
}
