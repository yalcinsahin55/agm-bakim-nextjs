import EngineBadge from "@/components/EngineBadge";
import { Button, Card } from "@/components/ui";
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
  const sortedRecords = records.slice().sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <Card className="overflow-hidden p-0 hover:border-borderlt">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={open} aria-label={`${engine.name} motor detaylarını ${open ? "kapat" : "aç"}`}>
        <EngineBadge name={engine.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-text">{engine.name}</div>
          <div className="mt-0.5 text-[10.5px] text-faint">{(typeof engine.maintenance_count === "number" ? engine.maintenance_count : records.length)} bakım · {(engine.load_kw || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kW</div>
        </div>
        <div className="flex-shrink-0 text-right"><div className="font-mono text-[13px] font-bold text-amber">{(engine.hours || 0).toLocaleString("tr-TR")}</div><div className="text-[8.5px] tracking-wide text-faint">SAAT</div></div>
        <span className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="border-t border-border bg-[#12161d] p-3 animate-fade-in">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-panel2 p-2 text-center"><div className="text-[9px] font-bold uppercase text-faint">Yük</div><div className="mt-0.5 font-mono text-[13px] font-bold text-teal">{(engine.load_kw || 0).toLocaleString("tr-TR")} kW</div></div>
          <div className="rounded-lg bg-panel2 p-2 text-center"><div className="text-[9px] font-bold uppercase text-faint">Son Güncelleme</div><div className="mt-0.5 text-[11px] font-bold text-text">{engine.updated_at ? new Date(engine.updated_at).toLocaleDateString("tr-TR") : "-"}</div></div>
        </div>
        <Button type="button" onClick={onShowQr} variant="secondary" size="md" className="mb-3 w-full border-amber/40 bg-amber/10 text-amber hover:bg-amber/20">▣ Hızlı bakım QR kodu göster ve indir</Button>
        {recordsLoading ? <div className="py-4 text-center text-[11px] text-muted">Bakım geçmişi yükleniyor...</div> : sortedRecords.length === 0 ? <div className="py-4 text-center text-[11px] text-faint">Henüz bakım kaydı yok.</div> : <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {sortedRecords.slice(0, 20).map((record) => <div key={record._id || record.group_id || `${engine._id}-${record.type_key || record.type_label || "record"}`} className="flex items-center justify-between rounded-lg border border-border bg-panel px-2.5 py-2"><div className="min-w-0"><div className="truncate text-[11.5px] font-semibold text-text">{record.type_label}</div><div className="text-[9.5px] text-faint">{getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "—"} · {record.technician_name || ""}</div></div><div className="flex-shrink-0 font-mono text-[11px] text-amber">{(record.hour_at_completion || 0).toLocaleString("tr-TR")} sa</div></div>)}
        </div>}
      </div>}
    </Card>
  );
}
