interface EquipmentInfoImportPanelProps {
  importFile: File | null;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onPreview: () => void;
  onImport: () => void;
  preview: { updated?: number; changes?: Array<{ row: number; engine: string }> } | null;
}

export default function EquipmentInfoImportPanel({ importFile, importing, onFileChange, onPreview, onImport, preview }: EquipmentInfoImportPanelProps) {
  return (
    <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
      <p className="text-[11.5px] text-muted mb-2 leading-relaxed"><b className="text-teal">Motor No, Kaver Tipi, Hava Filtresi, Krankcase, Eşanjör Tipi, Dungs, Radyatör Tipi, Not</b> sütunlarını içeren bir dosya yükleyin.</p>
      <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-control px-3 py-3 text-[12px] text-muted cursor-pointer mb-2 hover:border-amber hover:bg-amber/5 transition">
        <span className="text-[11px] font-bold text-teal" aria-hidden="true">XLSX</span>
        <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
        <input type="file" accept=".xlsx" onChange={(event) => onFileChange(event.target.files?.[0] || null)} className="hidden" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onPreview} disabled={importing || !importFile} className="w-full py-2.5 rounded-control border border-teal/40 bg-teal/10 text-teal font-extrabold text-[13px] disabled:opacity-50">{importing ? "Doğrulanıyor..." : "Önizle ve doğrula"}</button>
        <button type="button" onClick={onImport} disabled={importing || !importFile || !preview} className="w-full py-2.5 rounded-control bg-gradient-to-b from-amber-bright to-amber text-on-amber font-extrabold text-[13px] disabled:opacity-50">{importing ? "İçe aktarılıyor..." : "Onayla ve içe aktar"}</button>
      </div>
      {preview && <p className="mt-2 text-[10.5px] text-teal" aria-live="polite">{preview.updated || 0} satır doğrulandı; henüz veri yazılmadı.</p>}
    </div>
  );
}
