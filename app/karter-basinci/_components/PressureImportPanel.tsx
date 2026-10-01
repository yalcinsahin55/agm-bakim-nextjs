interface PressureImportPanelProps {
  importFile: File | null;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onPreview: () => void;
  onImport: () => void;
  preview: { inserted?: number } | null;
}

export default function PressureImportPanel({ importFile, importing, onFileChange, onPreview, onImport, preview }: PressureImportPanelProps) {
  return (
    <div className="bg-panel border border-border rounded-card p-3.5 animate-fade-in">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-[11px] font-bold text-teal" aria-hidden="true">XLSX</span>
        <p className="text-[12px] text-muted leading-relaxed flex-1">KARTER_FARK_BASINÇLARI.xlsx ile aynı yapıdaki bir dosyayı yükleyerek geçmiş ölçümleri toplu ekleyebilirsiniz. Her sayfa adı bir tarih (GG.AA.YYYY) olmalıdır.</p>
      </div>
      <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-control px-3 py-3 text-[12px] text-muted cursor-pointer mb-3 hover:border-amber hover:bg-amber/5 transition">
        <span className="text-[11px] font-bold text-teal" aria-hidden="true">XLSX</span>
        <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
        <input type="file" accept=".xlsx" onChange={(event) => onFileChange(event.target.files?.[0] || null)} className="hidden" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onPreview} disabled={importing || !importFile} className="w-full py-3 rounded-control border border-teal/40 bg-teal/10 text-teal font-extrabold text-[13px] disabled:opacity-50">{importing ? "Doğrulanıyor..." : "Önizle ve doğrula"}</button>
        <button type="button" onClick={onImport} disabled={importing || !importFile || !preview} className="w-full py-3 rounded-control bg-teal text-on-teal font-extrabold text-[13px] disabled:opacity-50">{importing ? "İçe aktarılıyor..." : "Onayla ve içe aktar"}</button>
      </div>
      {preview && <p className="mt-2 text-[10.5px] text-teal" aria-live="polite">{preview.inserted || 0} ölçüm satırı doğrulandı; henüz veri yazılmadı.</p>}
    </div>
  );
}
