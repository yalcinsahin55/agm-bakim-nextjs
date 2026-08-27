import type { MaintenanceType } from "@/lib/types";

interface ArchivedMaintenanceTypesProps {
  types: MaintenanceType[];
  restoringKey: string | null;
  onRestore: (key: string) => void;
}

export default function ArchivedMaintenanceTypes({ types, restoringKey, onRestore }: ArchivedMaintenanceTypesProps) {
  if (types.length === 0) return null;
  return (
    <section className="mt-4 bg-panel border border-border rounded-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold text-text">Arşivlenmiş bakım türleri</h2>
        <span className="text-[10px] text-faint">{types.length} gizli</span>
      </div>
      <p className="mt-1.5 text-[10.5px] text-faint">Silinen türler geçmiş kayıtlarıyla birlikte korunur. Geri aldığınızda aktif listelerde ve yeni bakım seçimlerinde yeniden görünür.</p>
      <div className="mt-3 flex flex-col gap-2">
        {types.map((type) => (
          <div key={type.key} className="flex items-center justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-text">{type.label}</div>
              <div className="text-[10px] text-faint">Varsayılan periyot: {type.default_period_hours ?? 0} sa</div>
            </div>
            <button
              onClick={() => onRestore(type.key)}
              disabled={restoringKey === type.key}
              className="flex-shrink-0 rounded-lg border border-teal/40 px-2.5 py-1.5 text-[11px] font-bold text-teal hover:bg-teal/10 disabled:opacity-50"
            >
              {restoringKey === type.key ? "Alınıyor..." : "Geri al"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
