import type { AnalysisResult, Engine } from "../_lib/types";

interface OilAnalysisFormProps {
  engines: Engine[];
  engineId: string;
  date: string;
  result: AnalysisResult;
  note: string;
  file: File | null;
  saving: boolean;
  onEngineChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onResultChange: (value: AnalysisResult) => void;
  onNoteChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
}

export default function OilAnalysisForm({ engines, engineId, date, result, note, file, saving, onEngineChange, onDateChange, onResultChange, onNoteChange, onFileChange, onSubmit }: OilAnalysisFormProps) {
  return (
    <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 flex flex-col gap-2 animate-fade-in">
      <select value={engineId} onChange={(event) => onEngineChange(event.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
        {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
      </select>
      <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => onDateChange(event.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition" />
      <select value={result} onChange={(event) => onResultChange(event.target.value as AnalysisResult)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
        <option>İyi</option><option>Dikkat</option><option>Kötü</option>
      </select>
      <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Not (opsiyonel)" rows={2} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:border-teal transition" />
      <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
        📄 {file ? file.name : "PDF raporu seç"}
        <input type="file" accept="application/pdf" onChange={(event) => onFileChange(event.target.files?.[0] || null)} className="hidden" />
      </label>
      <button onClick={onSubmit} disabled={saving} className="py-3 rounded-xl bg-amber text-bg font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
        {saving ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
            Yükleniyor...
          </span>
        ) : "💾 Raporu Kaydet"}
      </button>
    </div>
  );
}
