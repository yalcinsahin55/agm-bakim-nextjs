import type { MaintenanceType } from "@/lib/types";

interface AdditionalMaintenanceTypesProps {
  types: MaintenanceType[];
  trackedKeys: Set<string>;
  extraKeys: string[];
  extraPeriods: Record<string, number>;
  onToggle: (key: string, checked: boolean) => void;
  onPeriodChange: (key: string, value: number) => void;
}

export default function AdditionalMaintenanceTypes({ types, trackedKeys, extraKeys, extraPeriods, onToggle, onPeriodChange }: AdditionalMaintenanceTypesProps) {
  if (types.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="additional-maintenance-heading">
      <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">04 · Birlikte tamamlanan bakımlar</div><h2 id="additional-maintenance-heading" className="mt-1 text-base font-extrabold text-text">Aynı işlemde tamamlanan diğer bakım türleri</h2><p className="mt-1 text-[10px] leading-4 text-faint">İşaretlenen bakım türleri aynı saat ve tarihle kaydedilir. Motor için tanımlı olmayan bakımda periyodu ayrıca girebilirsiniz.</p></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => {
          const tracked = trackedKeys.has(type.key);
          const checked = extraKeys.includes(type.key);
          return (
            <div key={type.key} className="rounded-lg border border-border bg-panel2 px-3 py-2.5">
              <label className="flex items-center gap-2 text-[11px] text-text"><input type="checkbox" checked={checked} onChange={(event) => onToggle(type.key, event.target.checked)} />{type.label}{!tracked && <span className="text-[9.5px] text-faint">· tanımlı değil</span>}</label>
              {checked && !tracked && <label className="mt-2 block pl-6 text-[9.5px] font-bold uppercase tracking-wide text-muted">Periyodik bakım saati<input type="number" value={extraPeriods[type.key] ?? ""} onChange={(event) => onPeriodChange(type.key, Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-border bg-panel px-2 py-1.5 text-[11px] font-mono text-text" /></label>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
