import type { OilAnalysis } from "../_lib/types";

interface OilAnalysisPreviewModalProps {
  analysis: OilAnalysis;
  onClose: () => void;
}

export default function OilAnalysisPreviewModal({ analysis, onClose }: OilAnalysisPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="relative w-full max-w-3xl h-[85vh]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0 flex-1 text-[12px] font-bold text-text truncate">📄 {analysis.pdf_filename}</div>
          <div className="flex items-center gap-1.5 ml-2">
            <a
              href={`${analysis.pdf_url || ""}?download=1`}
              className="rounded-lg border border-amber/40 px-2 py-1 text-[10px] font-bold text-amber"
            >
              İndir
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-panel text-text text-lg hover:bg-red hover:text-white transition flex-shrink-0 ml-2"
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>
        </div>
        <iframe
          src={analysis.pdf_url || (analysis.pdf_b64 ? `data:application/pdf;base64,${analysis.pdf_b64.replace(/^data:application\/pdf;base64,/, "")}` : undefined)}
          title={analysis.pdf_filename}
          className="w-full h-[calc(100%-3rem)] rounded-xl border border-border bg-white"
          aria-label={`${analysis.pdf_filename} PDF önizlemesi`}
        />
      </div>
    </div>
  );
}
