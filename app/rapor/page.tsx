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
      const query = full ? "all=1" : "page=1&page_size=50";
      const res = await fetch(`/api/reports/engine/${encodeURIComponent(engineId)}?${query}`);
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
  }, [engineId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="px-4 py-4"><Skeleton className="h-12 w-full rounded-xl mb-4" /><Skeleton className="h-96 rounded-card" /></div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <style>{`@media print { aside, header, nav, .print-hide { display: none !important; } main { padding: 0 !important; margin: 0 !important; } body { background: #fff !important; } #rapor { border: none !important; box-shadow: none !important; border-radius: 0 !important; } } @page { margin: 12mm; }`}</style>
      <div className="print-hide"><TopBar title="Motor Bakım Raporu" subtitle="Yazdırılabilir bakım geçmişi" /></div>
      <div className="px-4 py-4 print-hide">
        <div className="flex gap-2">
          <select value={engineId} onChange={(event) => setEngineId(event.target.value)} className="flex-1 bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
            {engines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
          <button onClick={() => void printReport()} disabled={loadingRecords} className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">{loadingRecords ? "Hazırlanıyor..." : "🖨️ Yazdır / PDF"}</button>
        </div>
        <p className="text-[10.5px] text-faint mt-2">Önizleme en yeni 50 kaydı hızlı açar. Yazdır seçildiğinde seçili motorun tam geçmişi yüklenir; tarayıcı penceresinde "PDF olarak kaydet" seçebilirsiniz.</p>
      </div>

      <div className="px-4 pb-8">
        {loadingRecords ? <div className="text-center py-16 text-muted text-sm">Kayıtlar yükleniyor...</div> : (
          <div id="rapor" className="bg-white text-gray-900 rounded-xl border border-gray-300 shadow-xl p-6 md:p-8">
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-5"><div className="text-[18px] font-extrabold uppercase tracking-wide">Avcıkoru Santrali Bakım Merkezi</div><div className="text-[12px] text-gray-600 mt-1">Motor Bakım Raporu</div><div className="text-[10px] text-gray-500 mt-1">Rapor Tarihi: {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</div></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-[11px]">
              <div className="border border-gray-300 rounded p-2"><div className="text-gray-500 text-[9px] uppercase font-bold">Motor</div><div className="font-bold text-[13px]">{engine?.name || "—"}</div></div>
              <div className="border border-gray-300 rounded p-2"><div className="text-gray-500 text-[9px] uppercase font-bold">Güncel Saat</div><div className="font-bold font-mono text-[13px]">{(engine?.hours || 0).toLocaleString("tr-TR")} sa</div></div>
              <div className="border border-gray-300 rounded p-2"><div className="text-gray-500 text-[9px] uppercase font-bold">Yük</div><div className="font-bold font-mono text-[13px]">{(engine?.load_kw || 0).toLocaleString("tr-TR")} kW</div></div>
              <div className="border border-gray-300 rounded p-2"><div className="text-gray-500 text-[9px] uppercase font-bold">Toplam Bakım</div><div className="font-bold font-mono text-[13px]">{stats.total}</div></div>
            </div>

            {info && <div className="mb-5"><div className="text-[11px] font-extrabold uppercase tracking-wide border-b border-gray-400 pb-1 mb-2">Teknik Bilgiler</div><div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[10.5px]">{INFO_FIELDS.map(([key, label]) => info[key as InfoKey] ? <div key={key}><span className="text-gray-500">{label}:</span> <b>{info[key as InfoKey]}</b></div> : null)}{info.not && <div className="col-span-2 md:col-span-3"><span className="text-gray-500">Not:</span> {info.not}</div>}</div></div>}

            <div className="mb-5 text-[10.5px] text-gray-700"><div className="text-[11px] font-extrabold uppercase tracking-wide border-b border-gray-400 pb-1 mb-2">Özet</div>{stats.last ? <p>Bu motor için kayıtlı <b>{stats.total}</b> bakım bulunmaktadır. Son bakım <b>{getMaintenanceRecordDate(stats.last.maintenance_start_at, stats.last.created_at)?.toLocaleDateString("tr-TR") || "—"}</b> tarihinde (<b>{stats.last.type_label}</b>) yapılmıştır. Bakımlar arası ortalama süre <b>{stats.avgDays} gün</b>dür. Kayıtlı toplam bakım süresi <b>{formatMaintenanceDuration(reportSummary.total_duration_minutes)}</b>dir.</p> : <p>Bu motor için henüz bakım kaydı bulunmamaktadır.</p>}</div>

            <div className="text-[11px] font-extrabold uppercase tracking-wide border-b border-gray-400 pb-1 mb-2">Bakım Geçmişi</div>
            {stats.sortedDesc.length === 0 ? <p className="text-[10.5px] text-gray-500">Gösterilecek kayıt yok.</p> : <table className="w-full text-[10px] border-collapse"><thead><tr className="bg-gray-100"><th className="border border-gray-300 px-1.5 py-1 text-left">#</th><th className="border border-gray-300 px-1.5 py-1 text-left">Tarih</th><th className="border border-gray-300 px-1.5 py-1 text-left">Bakım Türü</th><th className="border border-gray-300 px-1.5 py-1 text-right">Saat</th><th className="border border-gray-300 px-1.5 py-1 text-left">Başlangıç</th><th className="border border-gray-300 px-1.5 py-1 text-left">Bitiş</th><th className="border border-gray-300 px-1.5 py-1 text-left">Süre</th><th className="border border-gray-300 px-1.5 py-1 text-left">Sorumlu Teknisyen</th><th className="border border-gray-300 px-1.5 py-1 text-left">Diğer Teknisyenler</th></tr></thead><tbody>{stats.sortedDesc.map((record, index) => <tr key={record._id} className={index % 2 === 1 ? "bg-gray-50" : ""}><td className="border border-gray-300 px-1.5 py-1 text-gray-500">{index + 1}</td><td className="border border-gray-300 px-1.5 py-1">{getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "—"}</td><td className="border border-gray-300 px-1.5 py-1 font-semibold">{record.type_label}</td><td className="border border-gray-300 px-1.5 py-1 text-right font-mono">{record.hour_at_completion.toLocaleString("tr-TR")}</td><td className="border border-gray-300 px-1.5 py-1">{record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "—"}</td><td className="border border-gray-300 px-1.5 py-1">{record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "—"}</td><td className="border border-gray-300 px-1.5 py-1">{formatMaintenanceDuration(record.maintenance_duration_minutes)}</td><td className="border border-gray-300 px-1.5 py-1">{record.technician_name || "—"}</td><td className="border border-gray-300 px-1.5 py-1">{record.other_technicians?.map((technician) => technician.full_name).join(", ") || "—"}</td></tr>)}</tbody></table>}
            {reportTruncated && <p className="mt-3 text-[10px] text-red-700">Bu yazdırma çıktısı en fazla 5.000 kayıt içerir.</p>}
            {!reportAll && reportTotal > records.length && <p className="mt-3 text-[10px] text-gray-500">Önizleme: en yeni {records.length} kayıt gösteriliyor. Tam geçmiş yazdırma sırasında yüklenir.</p>}
            <div className="grid grid-cols-2 gap-8 mt-10 text-[10px] text-gray-600"><div className="border-t border-gray-400 pt-1 text-center">Hazırlayan</div><div className="border-t border-gray-400 pt-1 text-center">Onaylayan</div></div>
          </div>
        )}
      </div>
      <div className="print-hide"><BottomNav /></div>
    </div>
  );
}
