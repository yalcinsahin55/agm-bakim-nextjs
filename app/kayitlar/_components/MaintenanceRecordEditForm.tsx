"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { queueRecord } from "@/lib/offlineQueue";
import { invalidateMaintenancePanel } from "@/lib/maintenancePanel";
import { canTechnicianWorkOnType, EXTERNAL_SERVICE_TECHNICIAN_ID, type TechnicianOption } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, normalizeTechnicianContributionDuration, TIME_TRACKING_VERSION } from "@/lib/maintenanceTime";
import type { Engine, MaintenanceRecord } from "../_types";
import { toLocalDateTimeInput } from "../_lib/recordMedia";
import { RecordEditEngineSection, RecordEditTechnicianSourceSection } from "./RecordEditAdminSections";
import RecordEditCollaborationSections from "./RecordEditCollaborationSections";
import RecordEditMediaSection from "./RecordEditMediaSection";
import { useRecordEditReferenceData } from "../_hooks/useRecordEditReferenceData";
import { useRecordEditMedia } from "../_hooks/useRecordEditMedia";
import RecordEditScheduleSection from "./RecordEditScheduleSection";

export interface MaintenanceRecordEditFormProps {
  record: MaintenanceRecord;
  onCancel: () => void;
  onSaved: () => void;
  onPhotoClick: (src: string) => void;
  isAdmin: boolean;
  ownerUserId: string;
  engines: Engine[];
}

export default function MaintenanceRecordEditForm({ record, onCancel, onSaved, onPhotoClick, isAdmin, ownerUserId, engines }: MaintenanceRecordEditFormProps) {
  const [engineId, setEngineId] = useState(record.engine_id);
  const [hours, setHours] = useState<number | string>(record.hour_at_completion);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState(toLocalDateTimeInput(record.maintenance_start_at));
  const [maintenanceEndAt, setMaintenanceEndAt] = useState(toLocalDateTimeInput(record.maintenance_end_at));
  const [techNote, setTechNote] = useState(record.technician_note || "");
  const [pressure, setPressure] = useState<number | string>(record.pressure_reading ?? "");
  const { technicians, maintenanceTypes, groupTypes } = useRecordEditReferenceData(record._id, record.extra_types || []);
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [extraPeriods, setExtraPeriods] = useState<Record<string, number>>({});
  const initialResponsibleContribution = (record.technician_contributions || []).find((contribution) => contribution.contribution_role === "responsible");
  const initialResponsibleMinutes = typeof initialResponsibleContribution?.duration_minutes === "number" ? initialResponsibleContribution.duration_minutes : record.maintenance_duration_minutes;
  const [technicianSource, setTechnicianSource] = useState<"internal" | "external_service">(record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? "external_service" : "internal");
  const [externalServiceName, setExternalServiceName] = useState(record.external_service_name || "");
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState(record.technician_id);
  const [responsibleTechnicianDurationMinutes, setResponsibleTechnicianDurationMinutes] = useState<number | null>(initialResponsibleMinutes ?? null);
  const [otherTechnicianIds, setOtherTechnicianIds] = useState<string[]>(record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? [] : record.other_technician_ids || []);
  const [otherTechnicianDurations, setOtherTechnicianDurations] = useState<Record<string, number>>(Object.fromEntries((record.technician_contributions || []).filter((contribution) => contribution.contribution_role === "support").map((contribution) => [contribution.id, contribution.duration_minutes])));
  const { photos, videos, reportAttachments, offlineMedia, offlinePreviews, transientPhotoUrls, reportAttachmentBusy, mediaBusy, setReportAttachments, setReportAttachmentBusy, addPhotos, addVideos, removePhoto, removeVideo, handleOfflineReportFile, removeReportAttachment } = useRecordEditMedia({
    initialPhotos: record.photos || record.photos_b64 || [],
    initialVideos: record.videos || [],
    initialReportAttachments: record.report_attachments || [],
  });
  const [busy, setBusy] = useState(false);
  const historicalTypeKeys = useMemo(() => new Set([record.type_key, ...(record.extra_types || []).map((extra) => extra.type_key), ...groupTypes.map((type) => type.type_key)]), [record.type_key, record.extra_types, groupTypes]);
  const selectedTypeKeys = useMemo(() => new Set([...historicalTypeKeys, ...extraKeys]), [historicalTypeKeys, extraKeys]);
  const selectedMaintenanceTypes = maintenanceTypes.filter((type) => selectedTypeKeys.has(type.key));
  const availableExtraTypes = maintenanceTypes.filter((type) => !historicalTypeKeys.has(type.key));
  const trackedExtraTypeKeys = useMemo(() => new Set(maintenanceTypes.filter((type) => type.engine_scope === "all" || Boolean(type.engine_states?.[engineId])).map((type) => type.key)), [maintenanceTypes, engineId]);
  const canWorkOnSelectedTypes = (technician: TechnicianOption, role: "responsible" | "support") => selectedMaintenanceTypes.length === 0 || selectedMaintenanceTypes.every((type) => canTechnicianWorkOnType(technician, type, role));
  const responsibleTechnicians = technicians.filter((technician) => canWorkOnSelectedTypes(technician, "responsible"));
  const supportTechnicians = technicians.filter((technician) => technician.id !== responsibleTechnicianId && canWorkOnSelectedTypes(technician, "support"));

  async function save() {
    const maintenanceDurationMinutes = calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt);
    if (!maintenanceDurationMinutes) {
      toast.error("Bakım başlangıç ve bitiş tarih-saatlerini geçerli şekilde girin.");
      return;
    }
    const selectedExtraTypes = extraKeys.flatMap((key) => {
      const type = maintenanceTypes.find((item) => item.key === key);
      if (!type) return [];
      const tracked = trackedExtraTypeKeys.has(key);
      const period = tracked ? undefined : Number(extraPeriods[key]);
      return [{ type_key: key, type_label: type.label, ...(period !== undefined ? { period } : {}) }];
    });
    if (selectedExtraTypes.some((type) => type.period !== undefined && (!Number.isFinite(type.period) || type.period <= 0))) {
      toast.error("Motor için henüz tanımlı olmayan ek bakım türlerine geçerli bir periyot saati girin.");
      return;
    }
    const responsibleDurationMinutes = isAdmin && technicianSource !== "external_service" ? responsibleTechnicianDurationMinutes : null;
    if (isAdmin && technicianSource !== "external_service" && (!responsibleDurationMinutes || responsibleDurationMinutes <= 0)) {
      toast.error("Sorumlu teknisyen için 0’dan büyük çalışma süresini saat ve dakika olarak girin.");
      return;
    }
    if (isAdmin && technicianSource !== "external_service" && responsibleDurationMinutes !== null && responsibleDurationMinutes > maintenanceDurationMinutes) {
      toast.error("Sorumlu teknisyen süresi toplam bakım süresini aşamaz.");
      return;
    }
    setBusy(true);
    const loadingToast = toast.loading("Kayıt güncelleniyor...");
    const payload = {
      engine_id: isAdmin ? engineId : undefined,
      hour_at_completion: Number(hours),
      time_tracking_version: TIME_TRACKING_VERSION,
      maintenance_start_at: new Date(maintenanceStartAt).toISOString(),
      maintenance_end_at: new Date(maintenanceEndAt).toISOString(),
      maintenance_duration_minutes: maintenanceDurationMinutes,
      technician_note: techNote,
      photos,
      videos,
      report_attachments: reportAttachments,
      pressure_reading: pressure !== "" ? Number(pressure) : undefined,
      other_technician_ids: technicianSource === "external_service" ? [] : otherTechnicianIds.filter((id) => supportTechnicians.some((technician) => technician.id === id)),
      other_technician_durations: technicianSource === "external_service" ? {} : Object.fromEntries(otherTechnicianIds.filter((id) => supportTechnicians.some((technician) => technician.id === id)).map((id) => [id, normalizeTechnicianContributionDuration(otherTechnicianDurations[id], maintenanceDurationMinutes)])
),
      technician_source: technicianSource,
      external_service_name: technicianSource === "external_service" ? externalServiceName.trim() || undefined : undefined,
      responsible_technician_id: isAdmin && technicianSource !== "external_service" ? responsibleTechnicianId : undefined,
      responsible_technician_duration: isAdmin && technicianSource !== "external_service" && responsibleDurationMinutes !== null ? responsibleDurationMinutes : undefined,
      extra_types: selectedExtraTypes,
    };
    try {
      if (!navigator.onLine || offlineMedia.length > 0) {
        await queueRecord(payload, offlineMedia, { method: "PATCH", endpoint: `/api/records/${record._id}`, ownerUserId });
        toast.dismiss(loadingToast);
        toast.success(navigator.onLine ? "Güncelleme ve rapor ekleri senkronizasyon kuyruğuna alındı." : "İnternet yok. Güncelleme ve rapor ekleri güvenle kuyruğa alındı.");
        onSaved();
        return;
      }
      const res = await fetch(`/api/records/${record._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Kayıt güncellendi! ✅");
        invalidateMaintenancePanel();
        window.dispatchEvent(new Event("notifications:refresh"));
        onSaved();
      } else {
        const d = await res.json();
        toast.dismiss(loadingToast);
        toast.error(d.error || "Güncellenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-border flex flex-col gap-2 animate-fade-in">
      <RecordEditEngineSection isAdmin={isAdmin} record={record} engines={engines} engineId={engineId} setEngineId={setEngineId} />
      <RecordEditTechnicianSourceSection
        isAdmin={isAdmin}
        record={record}
        technicianSource={technicianSource}
        setTechnicianSource={setTechnicianSource}
        externalServiceName={externalServiceName}
        setExternalServiceName={setExternalServiceName}
        responsibleTechnicianId={responsibleTechnicianId}
        setResponsibleTechnicianId={setResponsibleTechnicianId}
        responsibleTechnicianDurationMinutes={responsibleTechnicianDurationMinutes}
        setResponsibleTechnicianDurationMinutes={setResponsibleTechnicianDurationMinutes}
        setOtherTechnicianIds={setOtherTechnicianIds}
        technicians={technicians}
        responsibleTechnicians={responsibleTechnicians}
      />
      <RecordEditScheduleSection
        record={record}
        hours={hours}
        setHours={setHours}
        maintenanceStartAt={maintenanceStartAt}
        setMaintenanceStartAt={setMaintenanceStartAt}
        maintenanceEndAt={maintenanceEndAt}
        setMaintenanceEndAt={setMaintenanceEndAt}
        techNote={techNote}
        setTechNote={setTechNote}
        pressure={pressure}
        setPressure={setPressure}
      />
      <RecordEditCollaborationSections
        record={record}
        isAdmin={isAdmin}
        technicianSource={technicianSource}
        supportTechnicians={supportTechnicians}
        otherTechnicianIds={otherTechnicianIds}
        setOtherTechnicianIds={setOtherTechnicianIds}
        otherTechnicianDurations={otherTechnicianDurations}
        setOtherTechnicianDurations={setOtherTechnicianDurations}
        maintenanceStartAt={maintenanceStartAt}
        maintenanceEndAt={maintenanceEndAt}
        availableExtraTypes={availableExtraTypes}
        trackedExtraTypeKeys={trackedExtraTypeKeys}
        extraKeys={extraKeys}
        extraPeriods={extraPeriods}
        setExtraKeys={setExtraKeys}
        setExtraPeriods={setExtraPeriods}
        groupTypes={groupTypes}
        maintenanceTypes={maintenanceTypes}
      />
      <RecordEditMediaSection
        photos={photos}
        videos={videos}
        reportAttachments={reportAttachments}
        offlineMedia={offlineMedia}
        offlinePreviews={offlinePreviews}
        transientPhotoUrls={transientPhotoUrls}
        busy={busy}
        mediaBusy={mediaBusy}
        setReportAttachments={setReportAttachments}
        setReportAttachmentBusy={setReportAttachmentBusy}
        onPhotoClick={onPhotoClick}
        onAddPhotos={addPhotos}
        onAddVideos={addVideos}
        onRemovePhoto={removePhoto}
        onRemoveVideo={removeVideo}
        onOfflineReportFile={handleOfflineReportFile}
        onRemoveReportAttachment={removeReportAttachment}
      />
      <div className="flex gap-2 mt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">
          Vazgeç
        </button>
        <button
          onClick={save}
          disabled={busy || mediaBusy || reportAttachmentBusy}
          className="flex-1 py-2.5 rounded-lg bg-teal text-bg font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition"
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-[#06181b]/40 border-t-[#06181b] rounded-full animate-spin" />
              Kaydediliyor...
            </span>
          ) : (
            "💾 Kaydet"
          )}
        </button>
      </div>
    </div>
  );
}
