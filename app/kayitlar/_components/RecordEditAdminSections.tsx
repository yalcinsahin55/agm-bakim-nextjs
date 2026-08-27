"use client";

import type { Dispatch, SetStateAction } from "react";
import DurationInput from "@/components/DurationInput";
import {
  EXTERNAL_SERVICE_TECHNICIAN_ID,
  EXTERNAL_SERVICE_TECHNICIAN_NAME,
  TECHNICIAN_TYPE_LABELS,
  type TechnicianOption,
} from "@/lib/technicians";
import type { Engine, MaintenanceRecord } from "../_types";

type TechnicianSource = "internal" | "external_service";

type EngineSectionProps = {
  isAdmin: boolean;
  record: MaintenanceRecord;
  engines: Engine[];
  engineId: string;
  setEngineId: Dispatch<SetStateAction<string>>;
};

export function RecordEditEngineSection({ isAdmin, record, engines, engineId, setEngineId }: EngineSectionProps) {
  if (!isAdmin) return null;
  return <div className="rounded-lg border border-purple-400/30 bg-purple-400/5 p-2.5">
    <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bakım motoru</label>
    <p className="mt-0.5 text-[10px] text-faint">Yanlış motora kaydedilmişse doğru motoru seçin. Aynı olayda birlikte tamamlanan kardeş kayıtlar da birlikte taşınır.</p>
    <select value={engineId} onChange={(event) => setEngineId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-purple-300">
      {!engines.some((engine) => engine._id === record.engine_id) && <option value={record.engine_id}>{record.engine_name} (mevcut)</option>}
      {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
    </select>
    {engineId !== record.engine_id && <div className="mt-2 rounded-lg bg-purple-400/10 px-2 py-1.5 text-[10px] text-purple-100">Motor değişikliği: <b>{record.engine_name}</b> → <b>{engines.find((engine) => engine._id === engineId)?.name || "Yeni motor"}</b>. Eski motorun bakım takibi geri hesaplanacak.</div>}
  </div>;
}

type TechnicianSourceSectionProps = {
  isAdmin: boolean;
  record: MaintenanceRecord;
  technicianSource: TechnicianSource;
  setTechnicianSource: Dispatch<SetStateAction<TechnicianSource>>;
  externalServiceName: string;
  setExternalServiceName: Dispatch<SetStateAction<string>>;
  responsibleTechnicianId: string;
  setResponsibleTechnicianId: Dispatch<SetStateAction<string>>;
  responsibleTechnicianDurationMinutes: number | null;
  setResponsibleTechnicianDurationMinutes: Dispatch<SetStateAction<number | null>>;
  setOtherTechnicianIds: Dispatch<SetStateAction<string[]>>;
  technicians: TechnicianOption[];
  responsibleTechnicians: TechnicianOption[];
};

export function RecordEditTechnicianSourceSection({
  isAdmin,
  record,
  technicianSource,
  setTechnicianSource,
  externalServiceName,
  setExternalServiceName,
  responsibleTechnicianId,
  setResponsibleTechnicianId,
  responsibleTechnicianDurationMinutes,
  setResponsibleTechnicianDurationMinutes,
  setOtherTechnicianIds,
  technicians,
  responsibleTechnicians,
}: TechnicianSourceSectionProps) {
  if (!isAdmin) return null;
  return <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5">
    <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Sorumlu kaynağı</label>
    <p className="mt-0.5 text-[10px] text-faint">Kayıtlı teknisyen veya dış servis/garanti bakım kaynağı seçilebilir.</p>
    <select value={technicianSource} onChange={(event) => {
      const nextSource = event.target.value as TechnicianSource;
      setTechnicianSource(nextSource);
      if (nextSource === "external_service") {
        setOtherTechnicianIds([]);
        setResponsibleTechnicianId(EXTERNAL_SERVICE_TECHNICIAN_ID);
      } else if (responsibleTechnicianId === EXTERNAL_SERVICE_TECHNICIAN_ID) {
        setResponsibleTechnicianId(technicians[0]?.id || "");
      }
    }} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber">
      <option value="internal">Kayıtlı teknisyen</option>
      <option value="external_service">{EXTERNAL_SERVICE_TECHNICIAN_NAME}</option>
    </select>
    {technicianSource === "external_service" ? <>
      <input value={externalServiceName} onChange={(event) => setExternalServiceName(event.target.value)} placeholder="Servis veya firma adı (isteğe bağlı)" maxLength={160} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber" />
      <div className="mt-2 rounded-lg bg-amber/10 px-2 py-1.5 text-[10px] text-amber">Bu kayıt teknisyen performansına dahil edilmez ve yalnızca yönetici tarafından düzenlenebilir.</div>
    </> : <>
      <select value={responsibleTechnicianId} onChange={(event) => {
        const nextId = event.target.value;
        setResponsibleTechnicianId(nextId);
        setOtherTechnicianIds((current) => current.filter((id) => id !== nextId));
      }} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber">
        {record.technician_id !== EXTERNAL_SERVICE_TECHNICIAN_ID && !technicians.some((technician) => technician.id === record.technician_id) && <option value={record.technician_id}>{record.technician_name || "Mevcut sorumlu"} (mevcut)</option>}
        {responsibleTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.full_name} · {TECHNICIAN_TYPE_LABELS[technician.technician_type || "mekanik"] || "Mekanik teknisyen"}</option>)}
      </select>
      <div className="mt-2">
        <DurationInput valueMinutes={responsibleTechnicianDurationMinutes} onChange={setResponsibleTechnicianDurationMinutes} maxMinutes={366 * 24 * 60} required label="Sorumlu teknisyen çalışma süresi" />
        <div className="mt-1 text-[9.5px] text-faint">Saat ve dakika olarak gir. Varsayılan değer kaydın mevcut sorumlu süresidir.</div>
      </div>
    </>}
  </div>;
}
