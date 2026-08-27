import MiniLineChart from "./MiniLineChart";
import type { HistoryEntry } from "../_lib/types";

interface HistorySummaryPanelProps {
  history: HistoryEntry[];
  totalDelta: number;
  avgPerDay: number;
  historyTotal: number;
  hasLoadData: boolean;
}

export default function HistorySummaryPanel({ history, totalDelta, avgPerDay, historyTotal, hasLoadData }: HistorySummaryPanelProps) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-panel border border-border rounded-card p-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📈</span>
            <div className="text-[9px] text-faint uppercase font-bold">Toplam Artış</div>
          </div>
          <div className="font-mono text-[15px] font-bold text-text mt-1">{totalDelta.toLocaleString("tr-TR")} sa</div>
        </div>
        <div className="bg-panel border border-border rounded-card p-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">⚡</span>
            <div className="text-[9px] text-faint uppercase font-bold">Günlük Ort.</div>
          </div>
          <div className="font-mono text-[15px] font-bold text-amber mt-1">{avgPerDay.toFixed(1)} sa</div>
        </div>
        <div className="bg-panel border border-border rounded-card p-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📋</span>
            <div className="text-[9px] text-faint uppercase font-bold">Kayıt Sayısı</div>
          </div>
          <div className="font-mono text-[15px] font-bold text-text mt-1">{historyTotal}</div>
        </div>
      </div>

      <div className="mb-4">
        <MiniLineChart points={history.map((entry) => ({ y: entry.hours, label: new Date(entry.date).toLocaleDateString("tr-TR") }))} color="#e8952f" label="Çalışma Saati" />
      </div>

      {hasLoadData && (
        <div className="mb-4">
          <MiniLineChart points={history.filter((entry) => typeof entry.load_kw === "number").map((entry) => ({ y: entry.load_kw as number, label: new Date(entry.date).toLocaleDateString("tr-TR") }))} color="#3fb5c4" label="Yük (kW)" />
        </div>
      )}
    </>
  );
}
