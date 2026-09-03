import { WORK_DOMAIN_LABELS } from "@/lib/technicians";
import type { Engine, MaintenanceType, WorkDomain } from "@/lib/types";
import type { EngineRowState } from "../_lib/types";
import { WORK_DOMAINS } from "../_lib/types";

interface MaintenanceTypeCardProps {
  type: MaintenanceType;
  engineCount: number;
  engines: Engine[];
  editing: boolean;
  editLabel: string;
  editPeriod: number;
  editWorkDomains: WorkDomain[];
  editAllowElectromechanicalSupport: boolean;
  editAllowElectromechanicalResponsible: boolean;
  editRows: Record<string, EngineRowState>;
  savingEdit: boolean;
  confirmDelete: boolean;
  onStartEdit: (type: MaintenanceType) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onEditLabelChange: (value: string) => void;
  onEditPeriodChange: (value: number) => void;
  onToggleDomain: (domain: WorkDomain) => void;
  onAllowElectromechanicalSupportChange: (value: boolean) => void;
  onAllowElectromechanicalResponsibleChange: (value: boolean) => void;
  onToggleIncluded: (engineId: string, included: boolean) => void;
  onRowChange: (engineId: string, field: "last" | "period", value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
}

export default function MaintenanceTypeCard({
  type,
  engineCount,
  engines,
  editing,
  editLabel,
  editPeriod,
  editWorkDomains,
  editAllowElectromechanicalSupport,
  editAllowElectromechanicalResponsible,
  editRows,
  savingEdit,
  confirmDelete,
  onStartEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onEditLabelChange,
  onEditPeriodChange,
  onToggleDomain,
  onAllowElectromechanicalSupportChange,
  onAllowElectromechanicalResponsibleChange,
  onToggleIncluded,
  onRowChange,
  onCancelEdit,
  onSave,
}: MaintenanceTypeCardProps) {
  return (
    <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[13px] font-bold text-text truncate">{type.label}</div>
        <span className="text-[9.5px] font-extrabold px-2 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber flex-shrink-0">
          {engineCount} motor
        </span>
      </div>
      <div className="text-[11px] text-faint mb-2">Varsayılan periyot: <span className="font-mono text-amber">{type.default_period_hours} sa</span></div>
      <div className="mb-2 flex flex-wrap gap-1"><span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted">{(type.work_domains || ["mechanical"]).map((domain) => WORK_DOMAIN_LABELS[domain]).join(" + ")}</span>{type.allow_electromechanical_support === true && <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[9px] text-purple-200">Elektromekanik destek</span>}</div>
      <div className="flex gap-2">
        <button onClick={() => onStartEdit(type)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5 hover:bg-teal/10 transition">✏️ Düzenle</button>
        {confirmDelete ? (
          <>
            <button onClick={onConfirmDelete} className="text-[11px] font-bold text-bg bg-red rounded-lg px-2.5 py-1.5 hover:brightness-110 transition">⚠️ Emin misiniz?</button>
            <button onClick={onCancelDelete} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5 hover:bg-panel2 transition">Vazgeç</button>
          </>
        ) : (
          <button onClick={onRequestDelete} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5 hover:bg-red/10 transition">🗑️ Sil</button>
        )}
      </div>

      {editing && (
        <div className="mt-2 pt-2 border-t border-border flex flex-col gap-2 animate-fade-in">
          <input
            value={editLabel}
            onChange={(event) => onEditLabelChange(event.target.value)}
            className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal transition"
          />
          <input
            type="number"
            value={editPeriod}
            onChange={(event) => onEditPeriodChange(Number(event.target.value))}
            className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal transition"
          />
          <div className="rounded-lg border border-border bg-panel2 p-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-muted">Çalışma alanı</div><div className="mt-2 flex flex-wrap gap-1.5">{WORK_DOMAINS.map((domain) => <button key={domain} type="button" onClick={() => onToggleDomain(domain)} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${editWorkDomains.includes(domain) ? "border-teal/40 bg-teal/10 text-teal" : "border-border text-faint"}`}>{editWorkDomains.includes(domain) ? "✓ " : ""}{WORK_DOMAIN_LABELS[domain]}</button>)}</div><div className="mt-2 flex flex-col gap-1.5 text-[11px] text-text"><label className="flex items-center gap-1.5"><input type="checkbox" checked={editAllowElectromechanicalSupport} onChange={(event) => onAllowElectromechanicalSupportChange(event.target.checked)} />Elektromekanik destek seçilebilir</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={editAllowElectromechanicalResponsible} onChange={(event) => onAllowElectromechanicalResponsibleChange(event.target.checked)} />Elektromekanik sorumlu olabilir</label></div></div>
          <div className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
            <span>Dahil</span><span>Motor</span><span>Son Bakım Saati</span><span>Periyot</span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {engines.map((engine) => (
              <div key={engine._id} className="grid grid-cols-[48px_1fr_1fr_1fr] gap-1.5 items-center">
                <label className="flex items-center justify-center" title={`${engine.name} bakım kapsamına dahil olsun`}><input type="checkbox" checked={editRows[engine._id]?.included ?? false} onChange={(event) => onToggleIncluded(engine._id, event.target.checked)} /></label>
                <span className="text-[11.5px] font-semibold text-text">{engine.name}</span>
                <input
                  type="number"
                  placeholder="—"
                  value={editRows[engine._id]?.last ?? ""}
                  onChange={(event) => onRowChange(engine._id, "last", event.target.value)}
                  className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                />
                <input
                  type="number"
                  placeholder="—"
                  value={editRows[engine._id]?.period ?? ""}
                  onChange={(event) => onRowChange(engine._id, "period", event.target.value)}
                  className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                />
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-faint">İşareti kaldırılan motor kapsamdan çıkarılır. Boş bırakılan saat alanları mevcut değerini korur.</p>
          <div className="flex gap-2">
            <button onClick={onCancelEdit} className="flex-1 py-2 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">Vazgeç</button>
            <button onClick={onSave} disabled={savingEdit} className="flex-1 py-2 rounded-lg bg-teal text-bg font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition">
              {savingEdit ? "..." : "💾 Kaydet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
