interface PressureImportPanelProps {
  importFile: File | null;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onImport: () => void;
}

export default function PressureImportPanel({ importFile, importing, onFileChange, onImport }: PressureImportPanelProps) {
  return (
    <div className="bg-panel border border-border rounded-card p-3.5 animate-fade-in">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl">📊</span>
        <p className="text-[12px] text-muted leading-relaxed flex-1">
          KARTER_FARK_BASINÇLARI.xlsx ile aynı yapıdaki bir dosyayı yükleyerek geçmiş ölçümleri toplu ekleyebilirsiniz.
          Her sayfa adı bir tarih (GG.AA.YYYY) olmalıdır.
        </p>
      </div>
      <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-3 hover:border-amber hover:bg-amber/5 transition">
        <span className="text-lg">📁</span>
        <span className="flex-1">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
        <input
          type="file"
          accept=".xlsx"
          onChange={(event) => onFileChange(event.target.files?.[0] || null)}
          className="hidden"
        />
      </label>
      <button
        onClick={onImport}
        disabled={importing || !importFile}
        className="w-full py-3 rounded-xl bg-teal text-[#06181b] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
      >
        {importing ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
            İçe aktarılıyor...
          </span>
        ) : (
          "📥 İçe Aktar"
        )}
      </button>
    </div>
  );
}
