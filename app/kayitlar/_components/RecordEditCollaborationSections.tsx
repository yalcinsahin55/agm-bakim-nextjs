"use client";

import type { Dispatch, SetStateAction } from "react";
import type { MaintenanceRecord, MaintenanceType } from "../_types";
import { TECHNICIAN_TYPE_LABELS, type TechnicianOption } from "@/lib/technicians";
import { hoursInputToMinutes, minutesToHoursInput } from "../_lib/recordDisplay";
import { calculateMaintenanceDurationFromDates, normalizeTechnicianContributionDuration } from "@/lib/maintenanceTime";

type Props = {
  record: MaintenanceRecord;
  isAdmin: boolean;
  technicianSource: "internal" | "external_service";
  supportTechnicians: TechnicianOption[];
  otherTechnicianIds: string[];
  setOtherTechnicianIds: Dispatch<SetStateAction<string[]>>;
  otherTechnicianDurations: Record<string, number>;
  setOtherTechnicianDurations: Dispatch<SetStateAction<Record<string, number>>>;
  maintenanceStartAt: string;
  maintenanceEndAt: string;
  availableExtraTypes: MaintenanceType[];
  trackedExtraTypeKeys: Set<string>;
  extraKeys: string[];
  extraPeriods: Record<string, number>;
  setExtraKeys: Dispatch<SetStateAction<string[]>>;
  setExtraPeriods: Dispatch<SetStateAction<Record<string, number>>>;
  groupTypes: Array<{ type_key: string; type_label: string }>;
  maintenanceTypes: MaintenanceType[];
};

export default function RecordEditCollaborationSections({
  record,
  isAdmin,
  technicianSource,
  supportTechnicians,
  otherTechnicianIds,
  setOtherTechnicianIds,
  otherTechnicianDurations,
  setOtherTechnicianDurations,
  maintenanceStartAt,
  maintenanceEndAt,
  availableExtraTypes,
  trackedExtraTypeKeys,
  extraKeys,
  extraPeriods,
  setExtraKeys,
  setExtraPeriods,
  groupTypes,
  maintenanceTypes,
}: Props) {
  function toggleExtra(key: string, checked: boolean): void {
    setExtraKeys((current) => checked ? [...new Set([...current, key])] : current.filter((currentKey) => currentKey !== key));
    if (checked && extraPeriods[key] === undefined) {
      const type = maintenanceTypes.find((item) => item.key === key);
      setExtraPeriods((current) => ({ ...current, [key]: type?.default_period_hours || 1000 }));
    }
  }

  const durationMinutes = calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt) ?? 60;

  return <>
    {technicianSource !== "external_service" && supportTechnicians.length > 0 && <div className="rounded-lg border border-teal/30 bg-teal/5 p-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bu bakımda çalışan diğer teknisyenler</div>
      <div className="mt-0.5 text-[10px] text-faint">Sorumlu teknisyen dışında, bu bakım türünde destek yetkisi bulunan kişileri seç.</div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">{supportTechnicians.map((technician) => <div key={technician.id} className="rounded-lg bg-panel2 px-2 py-1.5 text-[11px] text-text"><label className="flex items-center gap-2"><input type="checkbox" checked={otherTechnicianIds.includes(technician.id)} onChange={(event) => { setOtherTechnicianIds((current) => event.target.checked ? [...new Set([...current, technician.id])] : current.filter((id) => id !== technician.id)); setOtherTechnicianDurations((current) => event.target.checked ? { ...current, [technician.id]: normalizeTechnicianContributionDuration(current[technician.id], durationMinutes) } : Object.fromEntries(Object.entries(current).filter(([id]) => id !== technician.id))); }} />{technician.full_name} <span className="text-[9px] text-faint">· {TECHNICIAN_TYPE_LABELS[technician.technician_type || "mekanik"] || "Mekanik teknisyen"}</span></label>{otherTechnicianIds.includes(technician.id) && <label className="mt-1 ml-6 flex items-center gap-1 text-[9.5px] text-faint">Çalışma süresi ({isAdmin ? "saat" : "dk"})<input type="number" min="0" max={isAdmin ? 8784 : 366 * 24 * 60} step={isAdmin ? "0.25" : "15"} value={isAdmin ? minutesToHoursInput(normalizeTechnicianContributionDuration(otherTechnicianDurations[technician.id], durationMinutes)) : normalizeTechnicianContributionDuration(otherTechnicianDurations[technician.id], durationMinutes)} onChange={(event) => setOtherTechnicianDurations((current) => ({ ...current, [technician.id]: isAdmin ? (hoursInputToMinutes(event.target.value) ?? 0) : Number(event.target.value) }))} className="w-16 rounded-md border border-border bg-panel px-1.5 py-1 text-right font-mono text-[10px] text-text" /></label>}</div>)}</div>
    </div>}

    {availableExtraTypes.length > 0 && <div className="rounded-lg border border-purple-400/30 bg-purple-400/5 p-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Birlikte tamamlanan bakım türünü sonradan ekle</div>
      <p className="mt-0.5 text-[10px] leading-4 text-faint">Seçtiğiniz türler bu kayıtla aynı bakım olayına bağlanır; başlangıç-bitiş zamanı ve teknisyen katkıları ortak kalır. Bu nedenle aynı anda yapılan bakım türleri teknisyen süresini ikinci kez artırmaz.</p>
      {groupTypes.length > 0 && <div className="mt-2 rounded-lg bg-panel2 px-2 py-1.5 text-[10px] text-purple-200">Bu olayda zaten kayıtlı: {[...new Set([record.type_label, ...groupTypes.map((type) => type.type_label)])].join(" · ")}</div>}
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">{availableExtraTypes.map((type) => {
        const checked = extraKeys.includes(type.key);
        const tracked = trackedExtraTypeKeys.has(type.key);
        return <div key={type.key} className="rounded-lg bg-panel2 px-2.5 py-2 text-[11px] text-text"><label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => toggleExtra(type.key, event.target.checked)} />{type.label}{!tracked && <span className="text-[9px] text-faint">· periyot isteyecek</span>}</label>{checked && !tracked && <label className="mt-1.5 ml-6 block text-[9.5px] font-bold uppercase tracking-wide text-muted">Periyodik bakım saati<input type="number" min="1" step="1" value={extraPeriods[type.key] ?? ""} onChange={(event) => setExtraPeriods((current) => ({ ...current, [type.key]: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded-md border border-border bg-panel px-2 py-1.5 text-[10.5px] font-mono text-text" /></label>}</div>;
      })}</div>
    </div>}
  </>;
}
