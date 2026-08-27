"use client";

import type { Dispatch, SetStateAction } from "react";
import type { MaintenanceRecord } from "../_types";
import { calculateMaintenanceDurationFromDates, formatMaintenanceDuration } from "@/lib/maintenanceTime";

type Props = {
  record: MaintenanceRecord;
  hours: number | string;
  setHours: Dispatch<SetStateAction<number | string>>;
  maintenanceStartAt: string;
  setMaintenanceStartAt: Dispatch<SetStateAction<string>>;
  maintenanceEndAt: string;
  setMaintenanceEndAt: Dispatch<SetStateAction<string>>;
  techNote: string;
  setTechNote: Dispatch<SetStateAction<string>>;
  pressure: number | string;
  setPressure: Dispatch<SetStateAction<number | string>>;
};

export default function RecordEditScheduleSection({
  record,
  hours,
  setHours,
  maintenanceStartAt,
  setMaintenanceStartAt,
  maintenanceEndAt,
  setMaintenanceEndAt,
  techNote,
  setTechNote,
  pressure,
  setPressure,
}: Props) {
  const durationMinutes = calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt);

  return <>
    <label className="text-[10.5px] font-bold text-muted uppercase">Motor Çalışma Saati</label>
    <input type="number" value={hours} onChange={(event) => setHours(event.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
    <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bakım Başlangıç ve Bitiş Zamanı</div>
      <div className="mt-0.5 text-[10px] text-faint">Haftalar süren bakımlar için tarih ve saati birlikte seçin.</div>
      {(!record.maintenance_start_at || !record.maintenance_end_at) && <div className="mt-2 rounded-lg bg-amber/10 px-2 py-1.5 text-[10px] text-amber">Bu eski kayıtta zaman bilgisi bulunmuyor. Kaydedebilmek için başlangıç ve bitiş tarih-saatini tamamlayın.</div>}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[10px] font-bold text-muted">Başlangıç
          <input required type="datetime-local" value={maintenanceStartAt} max={maintenanceEndAt || undefined} onChange={(event) => setMaintenanceStartAt(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono outline-none focus:border-amber" />
        </label>
        <label className="text-[10px] font-bold text-muted">Bitiş
          <input required type="datetime-local" value={maintenanceEndAt} min={maintenanceStartAt || undefined} onChange={(event) => setMaintenanceEndAt(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono outline-none focus:border-amber" />
        </label>
      </div>
      <div className={`mt-2 rounded-lg px-2 py-1.5 text-[10px] ${durationMinutes ? "bg-green/10 text-green" : "bg-red/10 text-red"}`} role="status">{formatMaintenanceDuration(durationMinutes) !== "—" ? `Toplam süre: ${formatMaintenanceDuration(durationMinutes)}` : "Geçerli bir başlangıç ve bitiş zamanı girin."}</div>
    </div>
    <textarea value={techNote} onChange={(event) => setTechNote(event.target.value)} placeholder="Bakımcı Notu" rows={2} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm resize-none outline-none focus:border-teal transition" />
    {(record.type_key === "krank" || record.type_key === "intercooler" || record.pressure_reading != null) && <input type="number" step="0.1" value={pressure} onChange={(event) => setPressure(event.target.value)} placeholder="Fark Basıncı (bar)" className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal transition" />}
  </>;
}
