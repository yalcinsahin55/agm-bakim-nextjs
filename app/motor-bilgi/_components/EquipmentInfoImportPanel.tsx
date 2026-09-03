interface EquipmentInfoImportPanelProps {
  importFile: File | null;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onImport: () => void;
}

export default function EquipmentInfoImportPanel({ importFile, importing, onFileChange, onImport }: EquipmentInfoImportPanelProps) {
  return (
    <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
      <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
        <b className="text-teal">Motor No, Kaver Tipi, Hava Filtresi, Krankcase, Eşanjör Tipi, Dungs, Radyatör Tipi, Not</b> sütunlarını içeren bir dosya yükleyin.
      </p>
      <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-2 hover:border-amber hover:bg-amber/5 transition">
        <span className="text-lg">📊</span>
        <span className="flex-1 truncate">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
        <input type="file" accept=".xlsx" onChange={(event) => onFileChange(event.target.files?.[0] || null)} className="hidden" />
      </label>
      <button onClick={onImport} disabled={importing || !importFile} className="w-full py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50 hover:brightness-110 transition">
        {importing ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
            İçe aktarılıyor...
          </span>
        ) : "🚀 İçe Aktar"}
      </button>
    </div>
  );
}
