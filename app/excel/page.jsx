"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ExcelPage() {
  const router =useRouter();
  const [importFile, setImportFile] = useState(null);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);

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
      const data = await res.json();
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
          <a href="/api/export/excel" className="block text-center py-3 rounded-xl bg-gradient-to-b from-teal to-teal/80 text-[#06181b] font-extrabold text-[13.5px] hover:brightness-110 active:scale-[.98] transition">
            📥 İndir (.xlsx)
          </a>
        </div>

        {/* İçe Aktar */}
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
          <input
            type="date" value={importDate} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setImportDate(e.target.value)}
            className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-1 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
          <p className="text-[10.5px] text-faint mb-3">Saat geçmişine bu tarihle kaydedilir — geçmiş bir Excel dosyası yüklüyorsanız o tarihi seçin.</p>

          <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-3 hover:border-amber hover:bg-amber/5 transition">
            <span className="text-lg">📊</span>
            <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx, .xls)"}</span>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
          </label>

          <button onClick={doImport} disabled={importing || !importFile} className="w-full py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
            {importing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                İçe aktarılıyor...
              </span>
            ) : "🚀 İçe Aktar"}
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
