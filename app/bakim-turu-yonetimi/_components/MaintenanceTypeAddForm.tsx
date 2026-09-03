import { WORK_DOMAIN_LABELS } from "@/lib/technicians";
import type { Engine, WorkDomain } from "@/lib/types";
import type { EngineRowState } from "../_lib/types";
import { WORK_DOMAINS } from "../_lib/types";

interface MaintenanceTypeAddFormProps {
  engines: Engine[];
  rows: Record<string, EngineRowState>;
  label: string;
  period: number;
  workDomains: WorkDomain[];
  allowElectromechanicalSupport: boolean;
  allowElectromechanicalResponsible: boolean;
  saving: boolean;
  onLabelChange: (value: string) => void;
  onPeriodChange: (value: number) => void;
  onToggleDomain: (domain: WorkDomain) => void;
  onAllowElectromechanicalSupportChange: (value: boolean) => void;
  onAllowElectromechanicalResponsibleChange: (value: boolean) => void;
  onToggleIncluded: (engineId: string, included: boolean) => void;
  onRowChange: (engineId: string, field: "last" | "period", value: string) => void;
  onSave: () => void;
}

export default function MaintenanceTypeAddForm({
  engines,
  rows,
  label,
  period,
  workDomains,
  allowElectromechanicalSupport,
  allowElectromechanicalResponsible,
  saving,
  onLabelChange,
  onPeriodChange,
  onToggleDomain,
  onAllowElectromechanicalSupportChange,
  onAllowElectromechanicalResponsibleChange,
  onToggleIncluded,
  onRowChange,
  onSave,
}: MaintenanceTypeAddFormProps) {
  return (
    <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 flex flex-col gap-2 animate-fade-in">
      <input
        placeholder="Bakım türü adı (örn. Egzoz Valfi Kontrolü)"
        value={label}
        onChange={(event) => onLabelChange(event.target.value)}
        className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
      />
      <input
        type="number"
        placeholder="Varsayılan periyodik bakım saati"
        value={period}
        onChange={(event) => onPeriodChange(Number(event.target.value))}
        className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
      />
      <div className="rounded-xl border border-border bg-panel2 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Çalışma alanı</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{WORK_DOMAINS.map((domain) => <button key={domain} type="button" onClick={() => onToggleDomain(domain)} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${workDomains.includes(domain) ? "border-teal/40 bg-teal/10 text-teal" : "border-border text-faint"}`}>{workDomains.includes(domain) ? "✓ " : ""}{WORK_DOMAIN_LABELS[domain]}</button>)}</div>
        <div className="mt-2 flex flex-col gap-1.5 text-[11px] text-text"><label className="flex items-center gap-1.5"><input type="checkbox" checked={allowElectromechanicalSupport} onChange={(event) => onAllowElectromechanicalSupportChange(event.target.checked)} />Elektromekanik destek seçilebilir</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={allowElectromechanicalResponsible} onChange={(event) => onAllowElectromechanicalResponsibleChange(event.target.checked)} />Elektromekanik sorumlu olabilir</label></div>
        <p className="mt-1.5 text-[10px] text-faint">Eski bakım türleri mekanik kabul edilir. Elektromekanik çalışanları ilgili alanda kullanmak için destek seçeneğini açın.</p>
      </div>
      <div className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
        <span>Dahil</span><span>Motor</span><span>İlk Bakım Saati</span><span>Periyot</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
        {engines.map((engine) => (
          <div key={engine._id} className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 items-center">
            <label className="flex items-center justify-center" title={`${engine.name} bakım kapsamına dahil olsun`}><input type="checkbox" checked={rows[engine._id]?.included ?? true} onChange={(event) => onToggleIncluded(engine._id, event.target.checked)} /></label>
            <span className="text-[11.5px] font-semibold text-text">{engine.name}</span>
            <input
              type="number"
              placeholder={String(engine.hours ?? 0)}
              value={rows[engine._id]?.last ?? ""}
              onChange={(event) => onRowChange(engine._id, "last", event.target.value)}
              className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
            />
            <input
              type="number"
              placeholder={String(period || 0)}
              value={rows[engine._id]?.period ?? ""}
              onChange={(event) => onRowChange(engine._id, "period", event.target.value)}
              className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
            />
          </div>
        ))}
      </div>
      <p className="text-[10.5px] text-faint">İşaretli motorlar kapsama alınır. İşareti kaldırılan motor için bakım kartı oluşturulmaz.</p>
      <button
        onClick={onSave}
        disabled={saving || !label.trim()}
        className="py-3 rounded-xl bg-gradient-to-b from-amber to-amber text-bg font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
      >
        {saving ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
            Ekleniyor...
          </span>
        ) : " Bakım Türünü Ekle"}
      </button>
    </div>
  );
}
