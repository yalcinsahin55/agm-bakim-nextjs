import type { AnalysisResult, Engine } from "../_lib/types";

type ResultFilter = "Tümü" | AnalysisResult;

interface OilAnalysisFiltersProps {
  engines: Engine[];
  search: string;
  filterEngine: string;
  resultFilter: ResultFilter;
  onSearchChange: (value: string) => void;
  onEngineFilterChange: (value: string) => void;
  onResultFilterChange: (value: ResultFilter) => void;
}

export default function OilAnalysisFilters({ engines, search, filterEngine, resultFilter, onSearchChange, onEngineFilterChange, onResultFilterChange }: OilAnalysisFiltersProps) {
  return (
    <div className="mb-3 rounded-card border border-border bg-panel p-3">
      <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Motor veya numune ara..." aria-label="Motor veya numune ara" className="w-full min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20" />
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={filterEngine} onChange={(event) => onEngineFilterChange(event.target.value)} aria-label="Analiz motor filtresi" className="min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[11px] font-bold text-text outline-none focus:border-teal transition">
          <option value="Tümü">Tüm motorlar</option>
          {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
        </select>
        <select value={resultFilter} onChange={(event) => onResultFilterChange(event.target.value as ResultFilter)} aria-label="Analiz sonuç filtresi" className="min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[11px] font-bold text-text outline-none focus:border-teal transition">
          <option value="Tümü">Tüm sonuçlar</option><option value="İyi">İyi</option><option value="Dikkat">Dikkat</option><option value="Kötü">Kötü</option>
        </select>
      </div>
    </div>
  );
}
