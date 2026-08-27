"use client";

import type { MaintenanceType } from "@/lib/types";
import { STATUS_LABELS, type PanelItem } from "@/lib/status";
import type { PanelEngine } from "@/lib/maintenancePanel";

interface MaintenanceDefinitionSectionProps {
  engineList: readonly PanelEngine[];
  items: readonly PanelItem[];
  allTypesSorted: readonly MaintenanceType[];
  engineId: string;
  typeKey: string;
  primaryPeriod: number;
  hours: number;
  quickMode: boolean;
  qrEngineId: string | null;
  qrTypeKey: string | null;
  chosenItem?: PanelItem;
  chosenType?: MaintenanceType;
  onEngineChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onPrimaryPeriodChange: (value: number) => void;
  onHoursChange: (value: number) => void;
}

export default function MaintenanceDefinitionSection({
  engineList,
  items,
  allTypesSorted,
  engineId,
  typeKey,
  primaryPeriod,
  hours,
  quickMode,
  qrEngineId,
  qrTypeKey,
  chosenItem,
  chosenType,
  onEngineChange,
  onTypeChange,
  onPrimaryPeriodChange,
  onHoursChange,
}: MaintenanceDefinitionSectionProps) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="maintenance-definition-heading">
      <div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">01 · Bakım tanımı</div><h2 id="maintenance-definition-heading" className="mt-1 text-base font-extrabold text-text">Motor ve bakım seçimi</h2></div><span className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9px] font-bold text-faint">ZORUNLU</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Motor
          <select value={engineId} onChange={(event) => onEngineChange(event.target.value)} disabled={Boolean(quickMode && qrEngineId)} className={`mt-1.5 w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-amber ${quickMode && qrEngineId ? "cursor-not-allowed opacity-80" : ""}`} aria-label={quickMode && qrEngineId ? "Hızlı bağlantı ile seçilen motor" : "Motor seçimi"}>
            {engineList.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
          </select>
        </label>
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bakım türü
          <select value={typeKey} onChange={(event) => onTypeChange(event.target.value)} disabled={Boolean(quickMode && qrTypeKey)} className={`mt-1.5 w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-amber ${quickMode && qrTypeKey ? "cursor-not-allowed opacity-80" : ""}`}>
            {allTypesSorted.map((type) => { const item = items.find((entry) => entry.engine_id === engineId && entry.type_key === type.key); const label = item ? `${type.label} · ${STATUS_LABELS[item.status]} · ${Math.round(item.remaining)} sa` : `${type.label} · Bu motor için tanımlı değil`; return <option key={type.key} value={type.key}>{label}</option>; })}
          </select>
        </label>
      </div>
      {chosenItem ? (
        <div className="mt-3 rounded-xl border border-teal/30 bg-teal/10 px-3 py-3 text-[11px] text-muted"><div className="mb-1 flex items-center justify-between gap-2"><span className="font-bold uppercase tracking-wide text-teal">Mevcut bakım takibi</span><span className="rounded-full bg-teal/15 px-2 py-1 text-[9px] font-bold text-teal">{STATUS_LABELS[chosenItem.status]}</span></div><div className="grid gap-1 sm:grid-cols-3"><span>Motor saati <b className="font-mono text-text">{chosenItem.engine_hours.toLocaleString("tr-TR")}</b></span><span>Son bakım <b className="font-mono text-text">{chosenItem.last_hour.toLocaleString("tr-TR")}</b></span><span>Periyot <b className="font-mono text-text">{chosenItem.period.toLocaleString("tr-TR")} sa</b></span></div></div>
      ) : chosenType ? (
        <div className="mt-3 rounded-xl border border-amber/30 bg-amber/10 px-3 py-3"><div className="text-[11px] leading-5 text-muted"><b className="text-amber">{chosenType.label}</b>, bu motor için tanımlı değil. Bu kaydı eklersen yeni bir bakım takibi başlatılır.</div><label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-muted">Periyodik bakım saati
          <input type="number" value={primaryPeriod} onChange={(event) => onPrimaryPeriodChange(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono text-text outline-none focus:border-amber" />
        </label></div>
      ) : null}
      <label className="mt-4 block text-[10.5px] font-bold uppercase tracking-wide text-muted">O anki motor çalışma saati
        <input type="number" value={hours} onChange={(event) => onHoursChange(Number(event.target.value) || 0)} className="mt-1.5 w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-base font-bold text-amber outline-none focus:border-amber" />
      </label>
      <p className="mt-2 text-[10px] leading-4 text-faint">Motorun güncel saatinden büyükse motorun güncel saatini de günceller; küçük veya eşitse yalnızca bu kayda yazılır.</p>
    </section>
  );
}
