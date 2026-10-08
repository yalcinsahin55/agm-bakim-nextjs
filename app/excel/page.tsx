"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";
import AppIcon from "@/components/ui/AppIcon";

interface ExcelEngine {
  _id: string;
  name: string;
}

interface ExcelMaintenanceType {
  _id?: string;
  key?: string;
  label: string;
}

interface ImportResult {
  updated?: number;
  error?: string;
  changes?: Array<{ engine: string; before: { hours: number; load_kw: number }; after: { hours: number; load_kw: number } }>;
  errors?: Array<{ row: number; engine: string; message: string }>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Dosya okunamadı."));
        return;
      }
      resolve(reader.result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

function localDateTimeValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateValue(date = new Date()): string {
  return localDateTimeValue(date).slice(0, 10);
}

export default function ExcelPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canImport = user?.role === "yonetici";
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDate, setImportDate] = useState(localDateTimeValue());
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [engines, setEngines] = useState<ExcelEngine[]>([]);
  const [types, setTypes] = useState<ExcelMaintenanceType[]>([]);
  const [reportEngine, setReportEngine] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const importDatePart = importDate.slice(0, 10);
  const importTimePart = importDate.slice(11, 16);
  const todayDate = localDateValue();
  const currentTime = localDateTimeValue().slice(11, 16);

  useEffect(() => {
    Promise.all([fetch("/api/engines"), fetch("/api/maintenance-types")]).then(async ([engineResponse, typeResponse]) => {
      if (engineResponse.status === 401) { router.push("/login"); return; }
      const engineData = await engineResponse.json() as unknown;
      const typeData = await typeResponse.json() as unknown;
      setEngines(Array.isArray(engineData) ? engineData as ExcelEngine[] : []);
      setTypes(Array.isArray(typeData) ? typeData as ExcelMaintenanceType[] : []);
    }).catch(() => {});
  }, [router]);

  const reportParams = useMemo(() => {
    const params = new URLSearchParams();
    if (reportEngine) params.set("engine_id", reportEngine);
    if (reportType) params.set("type_label", reportType);
    if (reportFrom) params.set("from", reportFrom);
    if (reportTo) params.set("to", reportTo);
    return params.toString();
  }, [reportEngine, reportType, reportFrom, reportTo]);
  const reportUrl = reportParams ? `/api/export/excel?${reportParams}` : "/api/export/excel";
  const pdfReportUrl = reportParams ? `/api/export/pdf?${reportParams}` : "/api/export/pdf";

  async function sendImport(validateOnly: boolean) {
    if (!importFile) {
      toast.error("Lütfen bir Excel dosyası seçin.");
      return;
    }
    setImporting(true);
    const loadingToast = toast.loading("Excel işleniyor...");
    try {
      const file_b64 = await fileToBase64(importFile);
      const res = await fetch("/api/import/hours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_b64, import_date: new Date(importDate).toISOString(), preview: validateOnly }),
      });
      const data = await res.json() as ImportResult;
      if (validateOnly) {
        toast.dismiss(loadingToast);
        setPreview(data);
        if (res.ok && !data.errors?.length) toast.success(`${data.changes?.length || 0} değişiklik doğrulandı.`);
        else toast.error(`${data.errors?.length || 0} satır doğrulanamadı.`);
      } else if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.updated} motor güncellendi.`);
        setPreview(null);
        router.push("/dashboard");
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Dosya okunamadı.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setImporting(false);
    }
  }
  function doPreview() { void sendImport(true); }
  function doImport() { void sendImport(false); }

  return (
    <div>
      <TopBar title="Excel Dışa / İçe Aktar" subtitle="Motor verilerini toplu yönetin" />
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Rapor İndir */}
        <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all animate-fade-in">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-control bg-teal/10 border border-teal/30 flex items-center justify-center text-teal flex-shrink-0" aria-hidden="true"><AppIcon name="download" size={19} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-text">Rapor İndir</div>
              <p className="text-[11.5px] text-muted mt-0.5 leading-relaxed">
                Motor saatleri, bakım özeti ve tüm bakım türlerini içeren çok sayfalı bir Excel dosyası indirir.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={reportEngine} onChange={(e) => setReportEngine(e.target.value)} className="bg-panel2 border border-border rounded-control px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
              <option value="">Tüm motorlar</option>
              {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
            </select>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="bg-panel2 border border-border rounded-control px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
              <option value="">Tüm bakım türleri</option>
              {types.map((type) => <option key={type.key || type._id} value={type.label}>{type.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="bg-panel2 border border-border rounded-control px-2.5 py-2.5 text-[12px] outline-none focus:border-teal" aria-label="Başlangıç tarihi" />
            <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="bg-panel2 border border-border rounded-control px-2.5 py-2.5 text-[12px] outline-none focus:border-teal" aria-label="Bitiş tarihi" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={reportUrl} download className="inline-flex items-center justify-center gap-2 rounded-control bg-gradient-to-b from-teal to-teal/80 py-3 text-[13px] font-extrabold text-on-teal transition hover:brightness-110 active:scale-[.98]">
               <AppIcon name="file" size={16} /> Excel indir
            </a>
            <a href={pdfReportUrl} download className="inline-flex items-center justify-center gap-2 rounded-control border border-amber/50 bg-amber/10 py-3 text-[13px] font-extrabold text-amber transition hover:bg-amber/20 active:scale-[.98]">
               <AppIcon name="file" size={16} /> PDF indir
            </a>
          </div>
          <p className="mt-2 text-[10px] text-faint">Seçtiğin motor, bakım türü ve tarih filtreleri her iki çıktıya da uygulanır. Büyük geçmişlerde en fazla 5.000 kayıt dışa aktarılır.</p>
        </div>

        {canImport && (
          <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all animate-fade-in">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-control bg-amber/10 border border-amber/30 flex items-center justify-center text-amber flex-shrink-0" aria-hidden="true"><AppIcon name="upload" size={19} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-text">Motor Saatlerini / Yüklerini İçe Aktar</div>
              <p className="text-[11.5px] text-muted mt-0.5 leading-relaxed">
                <b className="text-amber">MOTOR</b> ve <b className="text-amber">MOTOR ÇALIŞMA SAATİ</b> sütunlarını içeren bir Excel dosyası yükleyin. <b className="text-amber">YÜK</b> sütunu varsa yükler de güncellenir.
              </p>
            </div>
          </div>

          <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide block mb-1">Bu verinin ait olduğu tarih ve saat</label>
          <div className="grid grid-cols-2 gap-2 mb-1">
            <label className="text-[10px] font-semibold text-faint">Tarih<input
              type="date" value={importDatePart} max={todayDate}
              onChange={(e) => { setImportDate(`${e.target.value}T${importTimePart}`); setPreview(null); }}
              className="mt-1 w-full bg-panel2 border border-border rounded-control px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
              aria-label="Excel verisi tarihi"
            /></label>
            <label className="text-[10px] font-semibold text-faint">Saat<input
              type="time" value={importTimePart} max={importDatePart === todayDate ? currentTime : undefined}
              onChange={(e) => { setImportDate(`${importDatePart}T${e.target.value}`); setPreview(null); }}
              className="mt-1 w-full bg-panel2 border border-border rounded-control px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
              aria-label="Excel verisi saati"
            /></label>
          </div>
          <p className="text-[10.5px] text-faint mb-3">Excel saati bu tarih ve saatle geçmişe kaydedilir. Bir motorun saati önceki Excel değerinden düşükse dosya güvenlik nedeniyle reddedilir.</p>

          <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-control px-3 py-3 text-[12px] text-muted cursor-pointer mb-3 hover:border-amber hover:bg-amber/5 transition">
            <span className="text-[11px] font-bold text-teal" aria-hidden="true">XLSX</span>
            <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
            <input type="file" accept=".xlsx" onChange={(e) => { setImportFile(e.target.files?.[0] || null); setPreview(null); }} className="hidden" />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={doPreview} disabled={importing || !importFile} className="inline-flex w-full items-center justify-center gap-2 rounded-control border border-teal/40 bg-teal/10 py-3 text-[13.5px] font-extrabold text-teal transition hover:bg-teal/20 active:scale-[.98] disabled:opacity-50">
            <AppIcon name="search" size={16} /> {importing ? "Doğrulanıyor..." : "Önizle ve doğrula"}
          </button>
          <button type="button" onClick={doImport} disabled={importing || !importFile || !preview || Boolean(preview.errors?.length)} className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-gradient-to-b from-amber-bright to-amber py-3 text-[13.5px] font-extrabold text-on-amber transition hover:brightness-110 active:scale-[.98] disabled:opacity-50">
            {importing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-on-amber/40 border-t-on-amber rounded-full animate-spin" />
                İçe aktarılıyor...
              </span>
            ) : <><AppIcon name="upload" size={16} /> Onayla ve içe aktar</>}
          </button>
          </div>
          {preview && <div className={`mt-3 rounded-control border p-3 text-[11px] ${preview.errors?.length ? "border-red/40 bg-red/10" : "border-teal/30 bg-teal/10"}`} aria-live="polite">
            <div className="font-bold text-text">{preview.errors?.length ? "Önizleme hataları" : `${preview.changes?.length || 0} değişiklik hazır`}</div>
            {preview.errors?.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-red">{preview.errors.slice(0, 8).map((item) => <li key={`${item.row}-${item.engine}`}>Satır {item.row}{item.engine ? ` · ${item.engine}` : ""}: {item.message}</li>)}</ul> : <p className="mt-1 text-muted">Bu aşamada hiçbir veri yazılmadı. İçe aktarmak için onay düğmesini kullan.</p>}
          </div>}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
