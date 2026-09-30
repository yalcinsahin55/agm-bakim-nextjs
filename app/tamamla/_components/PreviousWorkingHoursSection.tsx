"use client";

import type { MaintenanceType } from "@/lib/types";

type Props = {
  types: MaintenanceType[];
  values: Record<string, number | string>;
  onChange: (key: string, value: number | string) => void;
  disabled?: boolean;
};

export default function PreviousWorkingHoursSection({ types, values, onChange, disabled = false }: Props) {
  if (!types.length) return null;
  return (
    <section className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4" aria-labelledby="previous-working-hours-heading">
      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">05 · Önceki çalışma saati</div>
        <h2 id="previous-working-hours-heading" className="mt-1 text-base font-extrabold text-text">Bakımın daha önce çalışmış süresi</h2>
        <p className="mt-1 text-[10px] leading-4 text-muted">Motor değiştiğinde veya bakım başka bir motorda daha önce yapıldıysa her bakım için geçmiş çalışma süresini ayrı girin. Değer, yeni bakım periyodunun başlangıç hesabına eklenir.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => {
          const value = values[type.key] ?? 0;
          const enabled = Number(value) > 0;
          return (
            <div key={type.key} className="rounded-lg border border-border bg-panel2 px-3 py-2.5">
              <label className="flex items-start gap-2 text-[11px] font-bold text-text">
                <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onChange(type.key, event.target.checked ? (Number(value) > 0 ? value : "") : 0)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
                <span>{type.label}<span className="mt-0.5 block text-[9.5px] font-normal text-muted">Bu bakımın önceki motorda çalışmış süresi var</span></span>
              </label>
              {enabled && <label className="mt-2 block pl-6 text-[9.5px] font-bold uppercase tracking-wide text-muted">Önceki çalışma süresi (saat)
                <input type="number" min="0" step="0.1" value={value} disabled={disabled} onChange={(event) => onChange(type.key, event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel px-2 py-1.5 text-[11px] font-mono text-text" placeholder="Örn. 3400" />
              </label>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
