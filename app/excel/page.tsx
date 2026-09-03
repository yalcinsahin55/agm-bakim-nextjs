"use client";

import { Button, Input, Select } from "@/components/ui";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";

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

export default function ExcelPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canImport = user?.role === "yonetici";
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [engines, setEngines] = useState<ExcelEngine[]>([]);
  const [types, setTypes] = useState<ExcelMaintenanceType[]>([]);
  const [reportEngine, setReportEngine] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

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

  async function doImport() {
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
        body: JSON.stringify({ file_b64, import_date: importDate }),
      });
      const data = await res.json() as ImportResult;
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.updated} motor güncellendi! 📊`);
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

  return (
    <div>
      <TopBar title="Excel Dışa / İçe Aktar" subtitle="Motor verilerini toplu yönetin" />
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Rapor İndir */}
        <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all animate-fade-in">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center text-xl flex-shrink-0">
              📤
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-text">Rapor İndir</div>
              <p className="text-[11.5px] text-muted mt-0.5 leading-relaxed">
                Motor saatleri, bakım özeti ve tüm bakım türlerini içeren çok sayfalı bir Excel dosyası indirir.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Select value={reportEngine} onChange={(e) => setReportEngine(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
              <option value="">Tüm motorlar</option>
              {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
            </Select>
            <Select value={reportType} onChange={(e) => setReportType(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12px] outline-none focus:border-teal">
              <option value="">Tüm bakım türleri</option>
              {types.map((type) => <option key={type.key || type._id} value={type.label}>{type.label}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12px] outline-none focus:border-teal" aria-label="Başlangıç tarihi" />
            <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12px] outline-none focus:border-teal" aria-label="Bitiş tarihi" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={reportUrl} className="block text-center py-3 rounded-xl bg-gradient-to-b from-teal to-teal/80 text-bg font-extrabold text-[13px] hover:brightness-110 active:scale-[.98] transition">
              📥 Excel indir
            </a>
            <a href={pdfReportUrl} className="block text-center py-3 rounded-xl border border-amber/50 bg-amber/10 text-amber font-extrabold text-[13px] hover:bg-amber/20 active:scale-[.98] transition">
              📄 PDF indir
            </a>
          </div>
          <p className="mt-2 text-[10px] text-faint">Seçtiğin motor, bakım türü ve tarih filtreleri her iki çıktıya da uygulanır. Büyük geçmişlerde en fazla 5.000 kayıt dışa aktarılır.</p>
        </div>

        {canImport && (
          <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all animate-fade-in">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber/10 border border-amber/30 flex items-center justify-center text-xl flex-shrink-0">
              📥
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-text">Motor Saatlerini / Yüklerini İçe Aktar</div>
              <p className="text-[11.5px] text-muted mt-0.5 leading-relaxed">
                <b className="text-amber">MOTOR</b> ve <b className="text-amber">MOTOR ÇALIŞMA SAATİ</b> sütunlarını içeren bir Excel dosyası yükleyin. <b className="text-amber">YÜK</b> sütunu varsa yükler de güncellenir.
              </p>
            </div>
          </div>

          <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide block mb-1">Bu verinin ait olduğu tarih</label>
          <Input
            type="date" value={importDate} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setImportDate(e.target.value)}
            className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-1 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
          <p className="text-[10.5px] text-faint mb-3">Saat geçmişine bu tarihle kaydedilir — geçmiş bir Excel dosyası yüklüyorsanız o tarihi seçin.</p>

          <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-3 hover:border-amber hover:bg-amber/5 transition">
            <span className="text-lg">📊</span>
            <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
            <Input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
          </label>

          <Button onClick={doImport} disabled={importing || !importFile} className="w-full py-3 rounded-xl bg-gradient-to-b from-amber to-amber text-bg font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
            {importing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
                İçe aktarılıyor...
              </span>
            ) : "🚀 İçe Aktar"}
          </Button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
