import type { PanelItem } from "@/lib/status";
import type { DashboardEngine } from "../_lib/types";
import { ENGINE_STATUS_VIEW } from "../_lib/types";

interface EngineHealthDetailsProps {
  engine: DashboardEngine;
  items: PanelItem[];
  onClose: () => void;
}

export default function EngineHealthDetails({ engine, items, onClose }: EngineHealthDetailsProps) {
  const sortedItems = [...items].sort((a, b) => a.remaining - b.remaining);
  const engineLoad = typeof engine.load_kw === "number" && Number.isFinite(engine.load_kw)
    ? `${engine.load_kw.toLocaleString("tr-TR")} kW`
    : "Yük verisi yok";
  return <div className="rounded-card border border-amber/30 bg-panel p-3.5 animate-fade-in">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><div className="text-[13px] font-bold text-text">{engine.name} bakım detayları</div><div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted"><span>Güncel motor saati: <b className="font-mono text-text">{engine.hours.toLocaleString("tr-TR")} sa</b></span><span aria-hidden="true">·</span><span>Güncel motor yükü: <b className="font-mono text-teal">{engineLoad}</b></span></div></div>
      <button type="button" onClick={onClose} className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-bold text-muted hover:text-text">Kapat</button>
    </div>
    {sortedItems.length === 0 ? <div className="rounded-lg bg-panel2 p-3 text-[11px] text-faint">Bu motor için tanımlı bakım türü bulunamadı.</div> : <div className="grid grid-cols-1 gap-2">{sortedItems.map((item) => {
      const statusView = ENGINE_STATUS_VIEW[item.status];
      const workedHours = item.engine_hours - item.last_hour;
      return <div key={`${item.engine_id}-${item.type_key}`} className="rounded-lg border border-border bg-panel2 p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11.5px] font-bold text-text">{item.type_label}</div><div className="mt-0.5 text-[9.5px] text-faint">Periyot: {item.period.toLocaleString("tr-TR")} sa</div></div><span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${statusView.text} bg-white/5`}>{statusView.label}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><div><div className="text-[9px] uppercase text-faint">Kalan</div><div className={`font-mono text-base font-extrabold ${statusView.text}`}>{item.remaining <= 0 ? `${Math.abs(Math.round(item.remaining)).toLocaleString("tr-TR")} sa gecikme` : `${Math.round(item.remaining).toLocaleString("tr-TR")} sa`}</div></div><div><div className="text-[9px] uppercase text-faint">Çalışılan</div><div className="font-mono text-base font-extrabold text-text">{Math.max(0, Math.round(workedHours)).toLocaleString("tr-TR")} sa</div></div></div>
        <div className="mt-2 text-[9.5px] text-faint">Son bakım: {item.last_hour.toLocaleString("tr-TR")} sa · Mevcut: {item.engine_hours.toLocaleString("tr-TR")} sa</div>
      </div>;
    })}</div>}
  </div>;
}
