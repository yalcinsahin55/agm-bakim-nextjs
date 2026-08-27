"use client";

import { EXTERNAL_SERVICE_TECHNICIAN_NAME, TECHNICIAN_TYPE_LABELS, type TechnicianOption } from "@/lib/technicians";
import DurationInput from "@/components/DurationInput";

type CompletionTechnicianSectionProps = {
  isManager: boolean;
  technicianSource: "internal" | "external_service";
  externalServiceName: string;
  responsibleTechnicianId: string;
  responsibleTechnicianDurationMinutes: number | null;
  responsibleTechnicians: TechnicianOption[];
  selectableTechnicians: TechnicianOption[];
  otherTechnicianIds: string[];
  otherTechnicianDurations: Record<string, number>;
  maintenanceDurationMinutes: number | null;
  onTechnicianSourceChange: (source: "internal" | "external_service") => void;
  onExternalServiceNameChange: (value: string) => void;
  onResponsibleTechnicianChange: (id: string) => void;
  onResponsibleTechnicianDurationChange: (value: number | null) => void;
  onOtherTechnicianToggle: (id: string, checked: boolean) => void;
  onOtherTechnicianDurationChange: (id: string, value: number | null) => void;
};

export default function CompletionTechnicianSection({
  isManager,
  technicianSource,
  externalServiceName,
  responsibleTechnicianId,
  responsibleTechnicianDurationMinutes,
  responsibleTechnicians,
  selectableTechnicians,
  otherTechnicianIds,
  otherTechnicianDurations,
  maintenanceDurationMinutes,
  onTechnicianSourceChange,
  onExternalServiceNameChange,
  onResponsibleTechnicianChange,
  onResponsibleTechnicianDurationChange,
  onOtherTechnicianToggle,
  onOtherTechnicianDurationChange,
}: CompletionTechnicianSectionProps) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="technician-source-heading">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">03 · Teknisyen ve kaynak</div>
          <h2 id="technician-source-heading" className="mt-1 text-base font-extrabold text-text">Ekip katkısı</h2>
        </div>
        <span className="rounded-full border border-border bg-panel2 px-2 py-1 text-[9px] font-bold text-faint">YÖNETİCİ KONTROLLÜ</span>
      </div>
      {isManager ? <>
        <label className="block text-[10.5px] font-bold uppercase tracking-wide text-muted">Sorumlu kaynağı
          <select value={technicianSource} onChange={(event) => onTechnicianSourceChange(event.target.value as "internal" | "external_service")} className="mt-1.5 w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-purple-400 sm:max-w-md">
            <option value="internal">Kayıtlı teknisyenler / benim hesabım</option><option value="external_service">{EXTERNAL_SERVICE_TECHNICIAN_NAME}</option>
          </select>
        </label>
        {technicianSource === "external_service" ? <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><input value={externalServiceName} onChange={(event) => onExternalServiceNameChange(event.target.value)} placeholder="Servis veya firma adı (isteğe bağlı)" maxLength={160} className="w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-purple-400" /><div className="rounded-lg bg-purple-400/10 px-3 py-2.5 text-[10.5px] leading-4 text-purple-200">Bu kayıt sorumlu teknisyen performansına dahil edilmez; geçmişte dış hizmet olarak görünür.</div></div> : <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"><label className="text-[10.5px] font-bold text-muted">Yetkili / sorumlu bakımcı
          <select id="responsible-technician" value={responsibleTechnicianId} onChange={(event) => onResponsibleTechnicianChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-purple-400"><option value="">Varsayılan: benim hesabım</option>{responsibleTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.full_name} · {TECHNICIAN_TYPE_LABELS[technician.technician_type] || "Mekanik teknisyen"}</option>)}</select></label><div><DurationInput valueMinutes={responsibleTechnicianDurationMinutes} onChange={onResponsibleTechnicianDurationChange} maxMinutes={maintenanceDurationMinutes ?? 366 * 24 * 60} required label="Sorumlu teknisyen çalışma süresi" /><span className="mt-1 block text-[9.5px] text-faint">Varsayılan değer toplam bakım süresidir.</span></div></div>}
      </> : <div className="rounded-lg border border-teal/20 bg-teal/5 px-3 py-2.5 text-[10.5px] text-muted">Kayıt, giriş yapan teknisyen hesabı adına oluşturulacak. Yönetici onayı gerektiren alanlar yalnızca yöneticilere gösterilir.</div>}
      {technicianSource !== "external_service" && selectableTechnicians.length > 0 && <div className="mt-4 border-t border-border pt-3"><div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Diğer çalışan teknisyenler</div><p className="mt-1 text-[10px] text-faint">Sorumlu teknisyen dışında bu bakımda çalışan ekip üyelerini seçin ve kişi bazlı sürelerini girin.</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{selectableTechnicians.map((technician) => <div key={technician.id} className="rounded-lg border border-border bg-panel2 px-3 py-2.5"><label className="flex items-center gap-2 text-[11px] text-text"><input type="checkbox" checked={otherTechnicianIds.includes(technician.id)} onChange={(event) => onOtherTechnicianToggle(technician.id, event.target.checked)} />{technician.full_name}<span className="text-[9.5px] text-faint">· {TECHNICIAN_TYPE_LABELS[technician.technician_type] || "Mekanik teknisyen"}</span></label>{otherTechnicianIds.includes(technician.id) && <div className="mt-2"><DurationInput valueMinutes={otherTechnicianDurations[technician.id] ?? null} onChange={(value) => onOtherTechnicianDurationChange(technician.id, value)} maxMinutes={maintenanceDurationMinutes ?? 366 * 24 * 60} compact required={isManager} label="Çalışma süresi" /></div>}</div>)}</div></div>}
    </section>
  );
}
