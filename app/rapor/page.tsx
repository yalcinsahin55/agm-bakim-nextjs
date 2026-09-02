"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { engineSortKey } from "@/lib/status";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";
import { formatMaintenanceDuration, getMaintenanceRecordDate } from "@/lib/maintenanceTime";

const INFO_FIELDS = [
  ["kaver_tipi", "Kaver Tipi"],
  ["hava_filtresi", "Hava Filtresi"],
  ["krankcase", "Krankcase"],
  ["esanjor_tipi", "Eşanjör Tipi"],
  ["dungs", "Dungs"],
  ["radyator_tipi", "Radyatör Tipi"],
] as const;

type InfoKey = typeof INFO_FIELDS[number][0];

interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface EquipmentInfo {
  engine_name: string;
  not?: string;
  [key: string]: string | undefined;
}

interface ReportRecord {
  _id: string;
  type_label: string;
  hour_at_completion: number;
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  technician_name?: string;
  other_technicians?: Array<{ id: string; full_name: string }>;
  created_at: string | Date;
}

interface ReportSummary {
  first_date: string | Date | null;
  last_date: string | Date | null;
  avg_days: number;
  total_duration_minutes?: number;
}

interface ReportResponse {
  records: ReportRecord[];
  total: number;
  totalPages: number;
  all: boolean;
  truncated: boolean;
  summary: ReportSummary;
}

function formatReportDateTime(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("tr-TR") : "—";
}

function formatRecordDate(record: ReportRecord): string {
  const date = getMaintenanceRecordDate(record.maintenance_start_at, record.created_at);
  return date ? date.toLocaleDateString("tr-TR") : "—";
}

function getTechnicianNames(record: ReportRecord): string {
  const names = record.other_technicians?.map((technician) => technician.full_name).filter(Boolean) || [];
  return names.length ? names.join(", ") : "—";
}

export default function RaporPage() {
  const router = useRouter();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [infoList, setInfoList] = useState<EquipmentInfo[]>([]);
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportSummary, setReportSummary] = useState<ReportSummary>({ first_date: null, last_date: null, avg_days: 0, total_duration_minutes: 0 });
  const [reportAll, setReportAll] = useState(false);
  const [reportTruncated, setReportTruncated] = useState(false);
  const [engineId, setEngineId] = useState("");
  const [reportScope, setReportScope] = useState<"all" | "month">("all");
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    Promise.all([
      cachedFetch<Engine[]>("/api/engines", 15_000),
      cachedFetch<EquipmentInfo[]>("/api/equipment-info", 15_000),
    ])
      .then(([eng, info]) => {
        const sortedEng = [...(Array.isArray(eng) ? eng : [])].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
        setEngines(sortedEng);
        setInfoList(Array.isArray(info) ? info : []);
        if (sortedEng.length) setEngineId(sortedEng[0]._id);
      })
      .catch((error) => {
        if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadReport(full = false) {
    if (!engineId) return;
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams(full ? { all: "1" } : { page: "1", page_size: "50" });
      if (reportScope === "month") params.set("month", reportMonth);
      const res = await fetch(`/api/reports/engine/${encodeURIComponent(engineId)}?${params.toString()}`);
      if (!res.ok) throw new ApiFetchError(res.status);
      const data = await res.json() as ReportResponse;
      setRecords(data.records || []);
      setReportTotal(data.total || 0);
      setReportSummary(data.summary || { first_date: null, last_date: null, avg_days: 0, total_duration_minutes: 0 });
      setReportAll(Boolean(data.all));
      setReportTruncated(Boolean(data.truncated));
      return data;
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      else toast.error("Motor raporu yüklenemedi.");
      throw error;
    } finally {
      setLoadingRecords(false);
    }
  }

  useEffect(() => {
    if (engineId) void loadReport(false);
  }, [engineId, reportScope, reportMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  async function printReport() {
    try {
      if (!reportAll && reportTotal > records.length) await loadReport(true);
      if (reportTruncated) {
        toast.error("Rapor 5.000 kayıtla sınırlandı; daha eski kayıtları ayrı sayfalarda görüntüleyin.");
      }
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      window.print();
    } catch {
      // loadReport kullanıcıya hata mesajını gösterdi.
    }
  }

  const engine = engines.find((item) => item._id === engineId);
  const info = infoList.find((item) => item.engine_name === engine?.name);

  const stats = useMemo(() => ({
    total: reportTotal,
    last: records[0] || null,
    avgDays: reportSummary.avg_days,
    sortedDesc: records,
  }), [records, reportSummary.avg_days, reportTotal]);

  if (loading) {
    return (
      <div>
        <TopBar title="Motor Bakım Raporu" />
        <div className="px-4 py-4"><Skeleton className="mb-4 h-12 w-full rounded-xl" /><Skeleton className="h-96 rounded-card" /></div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <style>{`@media print { aside, header, nav, .print-hide { display: none !important; } main { padding: 0 !important; margin: 0 !important; } body { background: #fff !important; } #rapor { border: none !important; box-shadow: none !important; border-radius: 0 !important; } .report-mobile-list { display: none !important; } .report-desktop-table { display: block !important; overflow: visible !important; } } @page { margin: 12mm; }`}</style>
      <div className="print-hide"><TopBar title="Motor Bakım Raporu" subtitle="Yazdırılabilir bakım geçmişi" /></div>
      <div className="print-hide px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <select value={engineId} onChange={(event) => setEngineId(event.target.value)} className="min-w-0 flex-1 bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal rounded-xl border border-border">
            {engines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
          <select value={reportScope} onChange={(event) => setReportScope(event.target.value as "all" | "month")} className="bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal rounded-xl border border-border">
            <option value="all">Tüm geçmiş</option>
            <option value="month">Ay seç</option>
          </select>
          {reportScope === "month" && <input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal rounded-xl border border-border" aria-label="Rapor ayı" />}
          <button onClick={() => void printReport()} disabled={loadingRecords} className="flex-shrink-0 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber px-4 py-2.5 text-[13px] font-extrabold text-[#1a1206] transition hover:brightness-110 active:scale-[.98] disabled:opacity-50">{loadingRecords ? "Hazırlanıyor..." : "🖨️ Yazdır / PDF"}</button>
        </div>
        <p className="mt-2 text-[10.5px] text-faint">{reportScope === "month" ? `${reportMonth} ayına ait kayıtlar gösteriliyor.` : "Seçili motorun tüm bakım geçmişi gösteriliyor."} Yazdır seçildiğinde aynı kapsamın tamamı yüklenir; tarayıcı penceresinde “PDF olarak kaydet” seçebilirsiniz.</p>
      </div>

      <div className="px-4 pb-28 md:pb-8">
        {loadingRecords ? <div className="py-16 text-center text-sm text-muted">Kayıtlar yükleniyor...</div> : (
          <div id="rapor" className="rounded-xl border border-gray-300 bg-white p-4 text-gray-900 shadow-xl sm:p-6 md:p-8">
            <div className="mb-5 border-b-2 border-gray-800 pb-4 text-center"><div className="text-[18px] font-extrabold uppercase tracking-wide">Avcıkoru Santrali Bakım Merkezi</div><div className="mt-1 text-[12px] text-gray-600">Motor Bakım Raporu</div><div className="mt-1 text-[10px] text-gray-500">Rapor Tarihi: {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</div></div>

            <div className="mb-5 grid min-w-0 grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
              <div className="min-w-0 rounded border border-gray-300 p-2"><div className="text-[9px] font-bold uppercase text-gray-500">Motor</div><div className="break-words text-[13px] font-bold">{engine?.name || "—"}</div></div>
              <div className="min-w-0 rounded border border-gray-300 p-2"><div className="text-[9px] font-bold uppercase text-gray-500">Güncel Saat</div><div className="break-words font-mono text-[13px] font-bold">{(engine?.hours || 0).toLocaleString("tr-TR")} sa</div></div>
              <div className="min-w-0 rounded border border-gray-300 p-2"><div className="text-[9px] font-bold uppercase text-gray-500">Yük</div><div className="break-words font-mono text-[13px] font-bold">{(engine?.load_kw || 0).toLocaleString("tr-TR")} kW</div></div>
              <div className="min-w-0 rounded border border-gray-300 p-2"><div className="text-[9px] font-bold uppercase text-gray-500">Toplam Bakım</div><div className="break-words font-mono text-[13px] font-bold">{stats.total}</div></div>
            </div>

            {info && <section className="mb-5"><div className="mb-2 border-b border-gray-400 pb-1 text-[11px] font-extrabold uppercase tracking-wide">Teknik Bilgiler</div><div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-[10.5px] sm:grid-cols-2 md:grid-cols-3">{INFO_FIELDS.map(([key, label]) => info[key as InfoKey] ? <div key={key} className="min-w-0 break-words"><span className="text-gray-500">{label}:</span> <b>{info[key as InfoKey]}</b></div> : null)}{info.not && <div className="col-span-1 min-w-0 break-words sm:col-span-2 md:col-span-3"><span className="text-gray-500">Not:</span> {info.not}</div>}</div></section>}

            <section className="mb-5 text-[10.5px] text-gray-700"><div className="mb-2 border-b border-gray-400 pb-1 text-[11px] font-extrabold uppercase tracking-wide">Özet</div>{stats.last ? <p className="break-words">Bu motor için kayıtlı <b>{stats.total}</b> bakım bulunmaktadır. Son bakım <b>{formatRecordDate(stats.last)}</b> tarihinde (<b>{stats.last.type_label || "Belirtilmemiş"}</b>) yapılmıştır. Bakımlar arası ortalama süre <b>{stats.avgDays} gün</b>dür. Kayıtlı toplam bakım süresi <b>{formatMaintenanceDuration(reportSummary.total_duration_minutes)}</b>dir.</p> : <p>Bu motor için henüz bakım kaydı bulunmamaktadır.</p>}</section>

            <section>
              <div className="mb-2 border-b border-gray-400 pb-1 text-[11px] font-extrabold uppercase tracking-wide">Bakım Geçmişi</div>
              {stats.sortedDesc.length === 0 ? <p className="text-[10.5px] text-gray-500">Gösterilecek kayıt yok.</p> : <>
                <div className="report-mobile-list space-y-3 md:hidden">
                  {stats.sortedDesc.map((record, index) => (
                    <article key={record._id} className="rounded-lg border border-gray-300 bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Bakım türü</div>
                          <div className="mt-0.5 break-words text-[13px] font-bold leading-5 text-gray-900">{record.type_label || "Belirtilmemiş"}</div>
                        </div>
                        <div className="shrink-0 text-right"><div className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Kayıt</div><div className="font-mono text-[12px] font-semibold text-gray-700">#{index + 1}</div></div>
                      </div>
                      <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-200 pt-3">
                        <div className="min-w-0"><div className="text-[9px] uppercase text-gray-500">Tarih</div><div className="mt-0.5 break-words text-[11px] font-medium">{formatRecordDate(record)}</div></div>
                        <div className="min-w-0 text-right"><div className="text-[9px] uppercase text-gray-500">Motor saati</div><div className="mt-0.5 break-words font-mono text-[11px] font-semibold">{record.hour_at_completion.toLocaleString("tr-TR")} sa</div></div>
                        <div className="min-w-0"><div className="text-[9px] uppercase text-gray-500">Başlangıç</div><div className="mt-0.5 break-words text-[11px] leading-4">{formatReportDateTime(record.maintenance_start_at)}</div></div>
                        <div className="min-w-0 text-right"><div className="text-[9px] uppercase text-gray-500">Bitiş</div><div className="mt-0.5 break-words text-[11px] leading-4">{formatReportDateTime(record.maintenance_end_at)}</div></div>
                        <div className="min-w-0"><div className="text-[9px] uppercase text-gray-500">Süre</div><div className="mt-0.5 break-words text-[11px] font-semibold">{formatMaintenanceDuration(record.maintenance_duration_minutes)}</div></div>
                        <div className="min-w-0"><div className="text-[9px] uppercase text-gray-500">Sorumlu teknisyen</div><div className="mt-0.5 break-words text-[11px]">{record.technician_name || "—"}</div></div>
                      </div>
                      <div className="mt-3 border-t border-gray-200 pt-2"><div className="text-[9px] uppercase text-gray-500">Diğer teknisyenler</div><div className="mt-0.5 break-words text-[11px] leading-4">{getTechnicianNames(record)}</div></div>
                    </article>
                  ))}
                </div>
                <div className="report-desktop-table hidden overflow-x-auto md:block">
                  <table className="w-full table-fixed border-collapse text-[10px]">
                    <thead><tr className="bg-gray-100"><th className="w-[4%] border border-gray-300 px-1.5 py-1 text-left">#</th><th className="w-[10%] border border-gray-300 px-1.5 py-1 text-left">Tarih</th><th className="w-[15%] border border-gray-300 px-1.5 py-1 text-left">Bakım Türü</th><th className="w-[9%] border border-gray-300 px-1.5 py-1 text-right">Saat</th><th className="w-[15%] border border-gray-300 px-1.5 py-1 text-left">Başlangıç</th><th className="w-[15%] border border-gray-300 px-1.5 py-1 text-left">Bitiş</th><th className="w-[10%] border border-gray-300 px-1.5 py-1 text-left">Süre</th><th className="w-[12%] border border-gray-300 px-1.5 py-1 text-left">Sorumlu Teknisyen</th><th className="w-[10%] border border-gray-300 px-1.5 py-1 text-left">Diğer Teknisyenler</th></tr></thead>
                    <tbody>{stats.sortedDesc.map((record, index) => <tr key={record._id} className={index % 2 === 1 ? "bg-gray-50" : ""}><td className="align-top break-words border border-gray-300 px-1.5 py-2 text-gray-500">{index + 1}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2">{formatRecordDate(record)}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2 font-semibold">{record.type_label || "Belirtilmemiş"}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2 text-right font-mono">{record.hour_at_completion.toLocaleString("tr-TR")}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2">{formatReportDateTime(record.maintenance_start_at)}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2">{formatReportDateTime(record.maintenance_end_at)}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2">{formatMaintenanceDuration(record.maintenance_duration_minutes)}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2">{record.technician_name || "—"}</td><td className="align-top break-words border border-gray-300 px-1.5 py-2">{getTechnicianNames(record)}</td></tr>)}</tbody>
                  </table>
                </div>
              </>}
            </section>

            {reportTruncated && <p className="mt-3 text-[10px] text-red-700">Bu yazdırma çıktısı en fazla 5.000 kayıtla sınırlandı; daha eski kayıtları ayrı sayfalarda görüntüleyin.</p>}
            {!reportAll && reportTotal > records.length && <p className="mt-3 text-[10px] text-gray-500">Önizleme: en yeni {records.length} kayıt gösteriliyor. Tam geçmiş yazdırma sırasında yüklenir.</p>}
            <div className="mt-10 grid grid-cols-2 gap-8 text-[10px] text-gray-600"><div className="border-t border-gray-400 pt-1 text-center">Hazırlayan</div><div className="border-t border-gray-400 pt-1 text-center">Onaylayan</div></div>
          </div>
        )}
      </div>
      <div className="print-hide"><BottomNav /></div>
    </div>
  );
}
