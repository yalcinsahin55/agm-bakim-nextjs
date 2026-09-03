import MiniLineChart from "./MiniLineChart";
import type { PressureEngine, PressureReading } from "./types";

interface PressureHistoryProps {
  historyEngines: PressureEngine[];
  historyEngine: string;
  historySearch: string;
  selectedHistoryEngine?: PressureEngine;
  engineHistory: PressureReading[];
  numericHistory: Array<PressureReading & { pressure_bar: number }>;
  readingsLength: number;
  readingsTotal: number;
  hasMoreReadings: boolean;
  loadingMoreReadings: boolean;
  onHistoryEngineChange: (value: string) => void;
  onHistorySearchChange: (value: string) => void;
  onLoadMore: () => void;
  onRemove: (id: string) => void;
  canDelete: (uploadedById?: string) => boolean;
}

export default function PressureHistory({
  historyEngines,
  historyEngine,
  historySearch,
  selectedHistoryEngine,
  engineHistory,
  numericHistory,
  readingsLength,
  readingsTotal,
  hasMoreReadings,
  loadingMoreReadings,
  onHistoryEngineChange,
  onHistorySearchChange,
  onLoadMore,
  onRemove,
  canDelete,
}: PressureHistoryProps) {
  return (
    <div className="animate-fade-in">
      <div className="mb-3 rounded-card border border-border bg-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Motor geçmişi</span><span className="text-[10px] text-faint">{selectedHistoryEngine?.name || "Motor seçilmedi"} · {engineHistory.length} kayıt</span></div>
        <input value={historySearch} onChange={(event) => onHistorySearchChange(event.target.value)} placeholder="Motor ara..." aria-label="Geçmişte motor ara" className="mb-2 w-full min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />

        <select value={historyEngine} onChange={(event) => onHistoryEngineChange(event.target.value)} aria-label="Geçmiş motoru seç" className="w-full min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[12px] font-bold text-text outline-none focus:border-teal transition">
          {historyEngines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
        </select>
      </div>

      {numericHistory.length >= 2 && (
        <div className="mb-3">
          <MiniLineChart
            points={numericHistory.map((reading) => ({
              y: reading.pressure_bar,
              label: new Date(reading.reading_date).toLocaleDateString("tr-TR"),
            }))}
            color="var(--color-amber)"
            label="Fark Basıncı (bar)"
          />
        </div>
      )}

      {engineHistory.length === 0 ? (
        <div className="text-center py-12 bg-panel border border-border rounded-card">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-muted">Bu motor için henüz ölçüm kaydı yok.</p>
          <p className="text-xs text-faint mt-1">Yeni ölçüm ekleyerek başlayın.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {[...engineHistory].reverse().map((reading) => (
            <div key={reading._id} className="flex items-center justify-between bg-panel border border-border rounded-xl px-3 py-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5 group">
              <div className="text-[12px] text-text flex-1">
                <span className="font-semibold">{new Date(reading.reading_date).toLocaleDateString("tr-TR")}</span>
                <span className="text-faint mx-2">·</span>
                <span className="text-amber font-mono">{reading.pressure_bar ?? reading.status ?? "-"} bar</span>
                {reading.load_kw !== null && reading.load_kw !== undefined && (
                  <>
                    <span className="text-faint mx-2">·</span>
                    <span className="text-teal font-mono">{reading.load_kw} kW</span>
                  </>
                )}
              </div>
              {canDelete(reading.uploaded_by_id) && (
                <button
                  onClick={() => onRemove(reading._id)}
                  className="text-[11px] text-red font-bold flex-shrink-0 ml-2 opacity-60 group-hover:opacity-100 hover:scale-110 transition"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
          {hasMoreReadings && (
            <button type="button" onClick={onLoadMore} disabled={loadingMoreReadings} className="mt-3 w-full rounded-xl border border-teal/30 bg-teal/5 px-3 py-2.5 text-[11px] font-bold text-teal disabled:opacity-50">
              {loadingMoreReadings ? "Daha fazla ölçüm yükleniyor..." : `${readingsLength.toLocaleString("tr-TR")} / ${readingsTotal.toLocaleString("tr-TR")} ölçüm · Daha fazla yükle`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
