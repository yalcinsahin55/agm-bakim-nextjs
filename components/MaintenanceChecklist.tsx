"use client";

interface MaintenanceChecklistProps {
  items: string[];
  values: Record<string, boolean>;
  complete: boolean;
  onItemChange: (item: string, checked: boolean) => void;
}

export default function MaintenanceChecklist({ items, values, complete, onItemChange }: MaintenanceChecklistProps) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="checklist-heading">
      <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">05 · Kontrol listesi</div><h2 id="checklist-heading" className="mt-1 text-base font-extrabold text-text">Bakım doğrulaması</h2><p className="mt-1 text-[10px] text-faint">Kaydetmeden önce tüm maddeleri işaretleyin.</p></div>
      <div className="grid gap-1.5">
        {items.map((item) => <label key={item} className="flex items-center gap-2.5 rounded-lg border border-border bg-panel2 px-3 py-2.5 text-[11px] text-text"><input type="checkbox" checked={values[item] === true} onChange={(event) => onItemChange(item, event.target.checked)} />{item}</label>)}
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2.5 text-[10.5px] ${complete ? "bg-green/10 text-green" : "bg-amber/10 text-amber"}`} role="status">{complete ? "✓ Kontrol listesi tamamlandı." : "Kontrol listesindeki tüm maddeleri işaretleyin."}</div>
    </section>
  );
}

export type { MaintenanceChecklistProps };
