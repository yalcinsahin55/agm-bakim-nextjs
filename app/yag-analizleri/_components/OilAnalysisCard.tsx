import type { OilAnalysis } from "../_lib/types";

interface OilAnalysisCardProps {
  analysis: OilAnalysis;
  canDelete: boolean;
  confirmDelete: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

export default function OilAnalysisCard({ analysis, canDelete, confirmDelete, onPreview, onDownload, onRequestDelete, onConfirmDelete, onCancelDelete }: OilAnalysisCardProps) {
  return (
    <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-teal/30 bg-teal/10 text-lg" aria-hidden="true">🧪</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-text">{analysis.engine_name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden="true" />{analysis.result}</div>
          <div className="mt-1 text-[11px] text-faint">{new Date(analysis.analysis_date).toLocaleDateString("tr-TR")} · {analysis.uploaded_by}</div>
          {analysis.note && <div className="mt-1 text-[11px] text-muted">📝 {analysis.note}</div>}
        </div>
        <button type="button" onClick={onPreview} className="flex-shrink-0 rounded-lg border border-teal/40 px-2.5 py-1.5 text-[10.5px] font-bold text-teal hover:bg-teal/10 transition" aria-label={`${analysis.engine_name} PDF önizlemesini aç`}>PDF’yi aç</button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border pt-2.5">
        <button type="button" onClick={onDownload} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted hover:border-teal/40 hover:text-teal transition">📄 İndir</button>
        {canDelete && (confirmDelete ? <><button type="button" onClick={onConfirmDelete} className="rounded-lg bg-red px-2.5 py-1.5 text-[11px] font-bold text-white hover:brightness-110 transition">Evet</button><button type="button" onClick={onCancelDelete} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted hover:bg-panel2 transition">Vazgeç</button></> : <button type="button" onClick={onRequestDelete} className="rounded-lg border border-red/40 px-2.5 py-1.5 text-[11px] font-bold text-red hover:bg-red/10 transition">Sil</button>)}
      </div>
    </div>
  );
}
