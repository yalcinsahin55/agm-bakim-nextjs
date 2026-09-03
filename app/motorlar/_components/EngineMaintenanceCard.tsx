import EngineBadge from "@/components/EngineBadge";
import { getMaintenanceRecordDate } from "@/lib/maintenanceTime";
import type { MotorEngine, MotorMaintenanceRecord } from "../_lib/types";

interface EngineMaintenanceCardProps {
  engine: MotorEngine;
  records: MotorMaintenanceRecord[];
  open: boolean;
  recordsLoading: boolean;
  onToggle: () => void;
  onShowQr: () => void;
}

export default function EngineMaintenanceCard({ engine, records, open, recordsLoading, onToggle, onShowQr }: EngineMaintenanceCardProps) {
  const sortedRecords = records
    .slice()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <div className="group overflow-hidden rounded-card border border-border bg-panel shadow-sm shadow-black/10 transition-all hover:border-teal/40 hover:shadow-lg hover:shadow-teal/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left"
        aria-expanded={open}
        aria-label={`${engine.name} motor detaylarını ${open ? "kapat" : "aç"}`}
      >
        <EngineBadge name={engine.name} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-extrabold tracking-tight text-text truncate">{engine.name}</div>
          <div className="mt-1 text-[10.5px] text-faint">
            {(typeof engine.maintenance_count === "number" ? engine.maintenance_count : records.length)} bakım · {(engine.load_kw || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kW
          </div>
        </div>
        <div className="flex-shrink-0 rounded-lg border border-amber/20 bg-amber/10 px-2 py-1 text-right">
          <div className="font-mono text-[14px] font-extrabold text-amber">
            {(engine.hours || 0).toLocaleString("tr-TR")}
          </div>
          <div className="text-[8.5px] font-bold tracking-wide text-faint">SAAT</div>
        </div>
        <span className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-border bg-[#12161d] p-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-panel2 rounded-lg p-2 text-center">
              <div className="text-[9px] text-faint uppercase font-bold">Yük</div>
              <div className="font-mono text-[13px] font-bold text-teal mt-0.5">
                {(engine.load_kw || 0).toLocaleString("tr-TR")} kW
              </div>
            </div>
            <div className="bg-panel2 rounded-lg p-2 text-center">
              <div className="text-[9px] text-faint uppercase font-bold">Son Güncelleme</div>
              <div className="text-[11px] font-bold text-text mt-0.5">
                {engine.updated_at ? new Date(engine.updated_at).toLocaleDateString("tr-TR") : "-"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onShowQr}
            className="mb-3 w-full rounded-xl border border-amber/40 bg-amber/10 py-2.5 text-[11px] font-extrabold text-amber transition hover:bg-amber/20 active:scale-[.98]"
          >
            ▣ Hızlı bakım QR kodu göster ve indir
          </button>

          {recordsLoading ? (
            <div className="text-center text-[11px] text-muted py-4">Bakım geçmişi yükleniyor...</div>
          ) : sortedRecords.length === 0 ? (
            <div className="text-center text-[11px] text-faint py-4">
              Henüz bakım kaydı yok.
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              {sortedRecords.slice(0, 20).map((record) => (
                <div key={record._id || record.group_id || `${engine._id}-${record.type_key || record.type_label || "record"}`} className="flex items-center justify-between bg-panel rounded-lg px-2.5 py-2 border border-border">
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-semibold text-text truncate">{record.type_label}</div>
                    <div className="text-[9.5px] text-faint">
                      {getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "—"} · {record.technician_name || ""}
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-amber flex-shrink-0">
                    {(record.hour_at_completion || 0).toLocaleString("tr-TR")} sa
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
