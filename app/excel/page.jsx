"use client";

import { useState } from "react";
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
  const [importFile, setImportFile] = useState(null);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);

  async function doImport() {
    if (!importFile) return;
    setImporting(true);
    setImportMsg(null);
    const file_b64 = await fileToBase64(importFile);
    const res = await fetch("/api/import/hours", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_b64, import_date: importDate }),
    });
    setImporting(false);
    const data = await res.json();
    if (res.ok) setImportMsg({ ok: true, text: `${data.updated} motor için çalışma saati/yükü güncellendi.` });
    else setImportMsg({ ok: false, text: data.error || "Dosya okunamadı." });
  }

  return (
    <div>
      <TopBar title="Excel Dışa / İçe Aktar" />
      <div className="px-4 py-4 flex flex-col gap-4">
        <div className="bg-panel border border-border rounded-card p-3.5">
          <div className="text-[13.5px] font-bold text-text mb-1.5">📤 Rapor İndir</div>
          <p className="text-[11.5px] text-muted mb-3 leading-relaxed">
            Motor saatleri, bakım özeti ve tüm bakım türlerini içeren çok sayfalı bir Excel dosyası indirir.
          </p>
          <a href="/api/export/excel" className="block text-center py-3 rounded-xl bg-teal text-[#06181b] font-extrabold text-[13.5px]">
            İndir (.xlsx)
          </a>
        </div>

        <div className="bg-panel border border-border rounded-card p-3.5">
          <div className="text-[13.5px] font-bold text-text mb-1.5">📥 Motor Saatlerini / Yüklerini İçe Aktar</div>
          <p className="text-[11.5px] text-muted mb-3 leading-relaxed">
            'MOTOR' ve 'MOTOR ÇALIŞMA SAATİ' sütunlarını içeren bir Excel dosyası yükleyin. 'YÜK' sütunu varsa yükler de güncellenir.
          </p>

          <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide">Bu verinin ait olduğu tarih</label>
          <input
            type="date" value={importDate} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setImportDate(e.target.value)}
            className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mt-1 mb-3"
          />
          <p className="text-[10.5px] text-faint -mt-2 mb-3">Saat geçmişine bu tarihle kaydedilir — geçmiş bir Excel dosyası yüklüyorsanız o tarihi seçin.</p>

          <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-2">
            📊 {importFile ? importFile.name : "Excel dosyası seç"}
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
          </label>
          {importMsg && <div className={`text-[12px] mb-2 ${importMsg.ok ? "text-green" : "text-red"}`}>{importMsg.text}</div>}
          <button onClick={doImport} disabled={importing || !importFile} className="w-full py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50">
            {importing ? "İçe aktarılıyor..." : "İçe Aktar"}
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
