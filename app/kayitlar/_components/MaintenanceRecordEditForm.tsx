"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import NextImage from "next/image";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { uploadMaintenanceMedia } from "@/lib/mediaUpload";
import { queueRecord, type QueuedMedia } from "@/lib/offlineQueue";
import ReportAttachmentPicker from "@/components/ReportAttachmentPicker";
import { invalidateMaintenancePanel } from "@/lib/maintenancePanel";
import { canTechnicianWorkOnType, EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME, TECHNICIAN_TYPE_LABELS, type TechnicianOption } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, formatMaintenanceDuration, normalizeTechnicianContributionDuration, TIME_TRACKING_VERSION } from "@/lib/maintenanceTime";
import { compressImage } from "@/lib/imageCompression";
import type { ReportAttachment } from "@/lib/types";
import type { Engine, MaintenanceRecord, MaintenanceType, VideoItem } from "../_types";
import { getPhotoSrc } from "../_lib/recordMedia";
import { hoursInputToMinutes, minutesToHoursInput } from "../_lib/recordDisplay";
import { withTimeout, makeOfflineId, getVideoSrc, toLocalDateTimeInput } from "../_lib/recordMedia";

export interface MaintenanceRecordEditFormProps {
  record: MaintenanceRecord;
  onCancel: () => void;
  onSaved: () => void;
  onPhotoClick: (src: string) => void;
  isAdmin: boolean;
  engines: Engine[];
}

export default function MaintenanceRecordEditForm({ record, onCancel, onSaved, onPhotoClick, isAdmin, engines }: MaintenanceRecordEditFormProps) {
  const [engineId, setEngineId] = useState(record.engine_id);
  const [hours, setHours] = useState<number | string>(record.hour_at_completion);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState(toLocalDateTimeInput(record.maintenance_start_at));
  const [maintenanceEndAt, setMaintenanceEndAt] = useState(toLocalDateTimeInput(record.maintenance_end_at));
  const [techNote, setTechNote] = useState(record.technician_note || "");
  const [pressure, setPressure] = useState<number | string>(record.pressure_reading ?? "");
  const [photos, setPhotos] = useState<string[]>(record.photos || record.photos_b64 || []);
  const [videos, setVideos] = useState<VideoItem[]>(record.videos || []);
  const [transientPhotoUrls, setTransientPhotoUrls] = useState<Set<string>>(() => new Set());
  const [reportAttachments, setReportAttachments] = useState<ReportAttachment[]>(record.report_attachments || []);
  const [reportAttachmentBusy, setReportAttachmentBusy] = useState(false);
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState<Record<string, string>>({});
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [groupTypes, setGroupTypes] = useState<Array<{ type_key: string; type_label: string }>>(() => record.extra_types || []);
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [extraPeriods, setExtraPeriods] = useState<Record<string, number>>({});
  const initialResponsibleContribution = (record.technician_contributions || []).find((contribution) => contribution.contribution_role === "responsible");
  const initialResponsibleMinutes = typeof initialResponsibleContribution?.duration_minutes === "number" ? initialResponsibleContribution.duration_minutes : record.maintenance_duration_minutes;
  const [technicianSource, setTechnicianSource] = useState<"internal" | "external_service">(record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? "external_service" : "internal");
  const [externalServiceName, setExternalServiceName] = useState(record.external_service_name || "");
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState(record.technician_id);
  const [responsibleTechnicianDuration, setResponsibleTechnicianDuration] = useState<string | number>(minutesToHoursInput(initialResponsibleMinutes));
  const [otherTechnicianIds, setOtherTechnicianIds] = useState<string[]>(record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? [] : record.other_technician_ids || []);
  const [otherTechnicianDurations, setOtherTechnicianDurations] = useState<Record<string, number>>(Object.fromEntries((record.technician_contributions || []).filter((contribution) => contribution.contribution_role === "support").map((contribution) => [contribution.id, contribution.duration_minutes])));
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const previewUrlsRef = useRef<Record<string, string>>({});
  const historicalTypeKeys = useMemo(() => new Set([record.type_key, ...(record.extra_types || []).map((extra) => extra.type_key), ...groupTypes.map((type) => type.type_key)]), [record.type_key, record.extra_types, groupTypes]);
  const selectedTypeKeys = useMemo(() => new Set([...historicalTypeKeys, ...extraKeys]), [historicalTypeKeys, extraKeys]);
  const selectedMaintenanceTypes = maintenanceTypes.filter((type) => selectedTypeKeys.has(type.key));
  const availableExtraTypes = maintenanceTypes.filter((type) => !historicalTypeKeys.has(type.key));
  const trackedExtraTypeKeys = useMemo(() => new Set(maintenanceTypes.filter((type) => type.engine_scope === "all" || Boolean(type.engine_states?.[engineId])).map((type) => type.key)), [maintenanceTypes, engineId]);
  const canWorkOnSelectedTypes = (technician: TechnicianOption, role: "responsible" | "support") => selectedMaintenanceTypes.length === 0 || selectedMaintenanceTypes.every((type) => canTechnicianWorkOnType(technician, type, role));
  const responsibleTechnicians = technicians.filter((technician) => canWorkOnSelectedTypes(technician, "responsible"));
  const supportTechnicians = technicians.filter((technician) => technician.id !== responsibleTechnicianId && canWorkOnSelectedTypes(technician, "support"));

  function createOfflinePreview(id: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    previewUrlsRef.current[id] = url;
    setOfflinePreviews((current) => ({ ...current, [id]: url }));
    return url;
  }

  function revokeOfflinePreview(id: string): void {
    const url = previewUrlsRef.current[id];
    if (url) URL.revokeObjectURL(url);
    delete previewUrlsRef.current[id];
    setOfflinePreviews((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  useEffect(() => () => {
    Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = {};
  }, []);

  useEffect(() => {
    fetch("/api/users/technicians")
      .then(async (response) => { if (response.ok) setTechnicians(await response.json()); })
      .catch(() => {});
    fetch("/api/maintenance-types")
      .then(async (response) => { if (response.ok) setMaintenanceTypes(await response.json()); })
      .catch(() => {});
    fetch(`/api/records/${record._id}?include_group=true`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { group_types?: Array<{ type_key?: unknown; type_label?: unknown }> };
        if (Array.isArray(data.group_types)) {
          setGroupTypes(data.group_types.filter((type): type is { type_key: string; type_label: string } => typeof type?.type_key === "string" && typeof type?.type_label === "string"));
        }
      })
      .catch(() => {});
  }, [record._id]);

  function removePhoto(index: number): void {
    const photo = photos[index];
    const id = photo?.startsWith("offline:") ? photo.slice("offline:".length) : "";
    if (id) {
      revokeOfflinePreview(id);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
    }
    if (photo && (photo.startsWith("http://") || photo.startsWith("https://"))) {
      setTransientPhotoUrls((current) => {
        if (!current.has(photo)) return current;
        const next = new Set(current);
        next.delete(photo);
        return next;
      });
    }
    setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function toggleExtra(key: string, checked: boolean): void {
    setExtraKeys((current) => checked ? [...new Set([...current, key])] : current.filter((currentKey) => currentKey !== key));
    if (checked && extraPeriods[key] === undefined) {
      const type = maintenanceTypes.find((item) => item.key === key);
      setExtraPeriods((current) => ({ ...current, [key]: type?.default_period_hours || 1000 }));
    }
  }

  function removeVideo(index: number): void {
    const video = videos[index];
    const url = typeof video === "string" ? video : video?.url;
    const id = url?.startsWith("offline:") ? url.slice("offline:".length) : "";
    if (id) {
      revokeOfflinePreview(id);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
    }
    setVideos((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleOfflineReportFile(file: File, attachment: ReportAttachment): void {
    const id = attachment.url.startsWith("offline:") ? attachment.url.slice("offline:".length) : makeOfflineId();
    setOfflineMedia((current) => [...current, { id, kind: "report", name: attachment.filename, type: attachment.mime, blob: file }]);
    createOfflinePreview(id, file);
  }

  function removeReportAttachment(attachment: ReportAttachment): void {
    if (!attachment.url.startsWith("offline:")) return;
    const id = attachment.url.slice("offline:".length);
    revokeOfflinePreview(id);
    setOfflineMedia((current) => current.filter((media) => media.id !== id));
  }

  async function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || mediaBusy) {
      e.target.value = "";
      return;
    }
    setMediaBusy(true);
    const uploaded: string[] = [];
    try {
      for (const f of files) {
        try {
          const compressed = await compressImage(f);
          const photoName = `${f.name.replace(/\.[^/.]+$/, "")}.jpg`;
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "photo", name: photoName, type: "image/jpeg", blob: compressed }]);
            createOfflinePreview(id, compressed);
            uploaded.push(`offline:${id}`);
            continue;
          }
          const url = await withTimeout(
            uploadMaintenanceMedia(
              new File([compressed], photoName, { type: "image/jpeg" }),
              "photo",
            ),
            150_000,
            "Fotoğraf yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin.",
          );
          uploaded.push(url);
        } catch (error) {
          if (!navigator.onLine) {
            try {
              const compressed = await compressImage(f);
              const id = makeOfflineId();
              const photoName = `${f.name.replace(/\.[^/.]+$/, "")}.jpg`;
              setOfflineMedia((current) => [...current, { id, kind: "photo", name: photoName, type: "image/jpeg", blob: compressed }]);
              createOfflinePreview(id, compressed);
              uploaded.push(`offline:${id}`);
              continue;
            } catch {
              // Genel hata aşağıda gösterilir.
            }
          }
          const message = error instanceof Error ? error.message : "Bilinmeyen hata";
          toast.error(`${f.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setTransientPhotoUrls((current) => {
        const next = new Set(current);
        uploaded.filter((url) => url.startsWith("http://") || url.startsWith("https://")).forEach((url) => next.add(url));
        return next;
      });
      setPhotos((p) => [...p, ...uploaded]);
      setMediaBusy(false);
      e.target.value = "";
    }
  }

  async function addVideos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || mediaBusy) {
      e.target.value = "";
      return;
    }
    setMediaBusy(true);
    try {
      for (const f of files) {
        if (f.size > 100 * 1024 * 1024) {
          toast.error(`'${f.name}' çok büyük (en fazla 100MB).`);
          continue;
        }
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
          createOfflinePreview(id, f);
          setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name, mime: f.type || "video/mp4" }]);
          continue;
        }
        try {
          const url = await withTimeout(
            uploadVideoChunked(f.type ? f : new File([f], f.name, { type: "video/mp4", lastModified: f.lastModified })),
            600_000,
            "Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.",
          );
          setVideos((v) => [...v, { url, filename: f.name, mime: f.type || "video/mp4" }]);
        } catch (err: unknown) {
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
            createOfflinePreview(id, f);
            setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name, mime: f.type || "video/mp4" }]);
            continue;
          }
          const message = err instanceof Error ? err.message.slice(0, 100) : "bilinmeyen hata";
          toast.error(`${f.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setMediaBusy(false);
      e.target.value = "";
    }
  }

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
    const responsibleDurationMinutes = isAdmin && technicianSource !== "external_service" ? hoursInputToMinutes(String(responsibleTechnicianDuration)) : null;
    if (isAdmin && technicianSource !== "external_service" && (!responsibleDurationMinutes || responsibleDurationMinutes <= 0)) {
      toast.error("Sorumlu teknisyen için 0’dan büyük çalışma süresini saat olarak girin.");
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
        await queueRecord(payload, offlineMedia, { method: "PATCH", endpoint: `/api/records/${record._id}` });
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
      {isAdmin && <div className="rounded-lg border border-purple-400/30 bg-purple-400/5 p-2.5">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bakım motoru</label>
        <p className="mt-0.5 text-[10px] text-faint">Yanlış motora kaydedilmişse doğru motoru seçin. Aynı olayda birlikte tamamlanan kardeş kayıtlar da birlikte taşınır.</p>
        <select value={engineId} onChange={(event) => setEngineId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-purple-300">
          {!engines.some((engine) => engine._id === record.engine_id) && <option value={record.engine_id}>{record.engine_name} (mevcut)</option>}
          {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
        </select>
        {engineId !== record.engine_id && <div className="mt-2 rounded-lg bg-purple-400/10 px-2 py-1.5 text-[10px] text-purple-100">Motor değişikliği: <b>{record.engine_name}</b> → <b>{engines.find((engine) => engine._id === engineId)?.name || "Yeni motor"}</b>. Eski motorun bakım takibi geri hesaplanacak.</div>}
      </div>}
      {isAdmin && <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Sorumlu kaynağı</label>
        <p className="mt-0.5 text-[10px] text-faint">Kayıtlı teknisyen veya dış servis/garanti bakım kaynağı seçilebilir.</p>
        <select value={technicianSource} onChange={(event) => { const nextSource = event.target.value as "internal" | "external_service"; setTechnicianSource(nextSource); if (nextSource === "external_service") { setOtherTechnicianIds([]); setResponsibleTechnicianId(EXTERNAL_SERVICE_TECHNICIAN_ID); } else if (responsibleTechnicianId === EXTERNAL_SERVICE_TECHNICIAN_ID) { setResponsibleTechnicianId(technicians[0]?.id || ""); } }} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber">
          <option value="internal">Kayıtlı teknisyen</option>
          <option value="external_service">{EXTERNAL_SERVICE_TECHNICIAN_NAME}</option>
        </select>
        {technicianSource === "external_service" ? <>
          <input value={externalServiceName} onChange={(event) => setExternalServiceName(event.target.value)} placeholder="Servis veya firma adı (isteğe bağlı)" maxLength={160} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber" />
          <div className="mt-2 rounded-lg bg-amber/10 px-2 py-1.5 text-[10px] text-amber">Bu kayıt teknisyen performansına dahil edilmez ve yalnızca yönetici tarafından düzenlenebilir.</div>
        </> : <> <select value={responsibleTechnicianId} onChange={(event) => { const nextId = event.target.value; setResponsibleTechnicianId(nextId); setOtherTechnicianIds((current) => current.filter((id) => id !== nextId)); }} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber">
          {record.technician_id !== EXTERNAL_SERVICE_TECHNICIAN_ID && !technicians.some((technician) => technician.id === record.technician_id) && <option value={record.technician_id}>{record.technician_name || "Mevcut sorumlu"} (mevcut)</option>}
          {responsibleTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.full_name} · {TECHNICIAN_TYPE_LABELS[technician.technician_type || "mekanik"] || "Mekanik teknisyen"}</option>)}
        </select>
        <label className="mt-2 block text-[10px] font-bold text-muted">Sorumlu teknisyen çalışma süresi (saat)
          <input type="number" min="0.25" max="8784" step="0.25" value={responsibleTechnicianDuration} onChange={(event) => setResponsibleTechnicianDuration(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono outline-none focus:border-amber" />
        </label>
        <div className="mt-1 text-[9.5px] text-faint">Her kişinin gerçek çalışma süresini ayrı gir. Varsayılan değer kaydın mevcut sorumlu süresidir.</div></>}
      </div>}
      <label className="text-[10.5px] font-bold text-muted uppercase">Motor Çalışma Saati</label>
      <input
        type="number"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
      />
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
        <div className={`mt-2 rounded-lg px-2 py-1.5 text-[10px] ${calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt) ? "bg-green/10 text-green" : "bg-red/10 text-red"}`} role="status">{formatMaintenanceDuration(calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt)) !== "—" ? `Toplam süre: ${formatMaintenanceDuration(calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt))}` : "Geçerli bir başlangıç ve bitiş zamanı girin."}</div>
      </div>
      <textarea
        value={techNote}
        onChange={(e) => setTechNote(e.target.value)}
        placeholder="Bakımcı Notu"
        rows={2}
        className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm resize-none outline-none focus:border-teal transition"
      />
      {(record.type_key === "krank" || record.type_key === "intercooler" || record.pressure_reading != null) && (
        <input
          type="number"
          step="0.1"
          value={pressure}
          onChange={(e) => setPressure(e.target.value)}
          placeholder="Fark Basıncı (bar)"
          className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal transition"
        />
      )}

      {technicianSource !== "external_service" && supportTechnicians.length > 0 && <div className="rounded-lg border border-teal/30 bg-teal/5 p-2.5">
        <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bu bakımda çalışan diğer teknisyenler</div>
        <div className="mt-0.5 text-[10px] text-faint">Sorumlu teknisyen dışında, bu bakım türünde destek yetkisi bulunan kişileri seç.</div>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">{supportTechnicians.map((technician) => <div key={technician.id} className="rounded-lg bg-panel2 px-2 py-1.5 text-[11px] text-text"><label className="flex items-center gap-2"><input type="checkbox" checked={otherTechnicianIds.includes(technician.id)} onChange={(event) => { setOtherTechnicianIds((current) => event.target.checked ? [...new Set([...current, technician.id])] : current.filter((id) => id !== technician.id)); setOtherTechnicianDurations((current) => event.target.checked ? { ...current, [technician.id]: normalizeTechnicianContributionDuration(current[technician.id], calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt) ?? 60) } : Object.fromEntries(Object.entries(current).filter(([id]) => id !== technician.id))); }} />{technician.full_name} <span className="text-[9px] text-faint">· {TECHNICIAN_TYPE_LABELS[technician.technician_type || "mekanik"] || "Mekanik teknisyen"}</span></label>{otherTechnicianIds.includes(technician.id) && <label className="mt-1 ml-6 flex items-center gap-1 text-[9.5px] text-faint">Çalışma süresi ({isAdmin ? "saat" : "dk"})<input type="number" min="0" max={isAdmin ? 8784 : 366 * 24 * 60} step={isAdmin ? "0.25" : "15"} value={isAdmin ? minutesToHoursInput(normalizeTechnicianContributionDuration(otherTechnicianDurations[technician.id], calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt) ?? 60)) : normalizeTechnicianContributionDuration(otherTechnicianDurations[technician.id], calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt) ?? 60)} onChange={(event) => setOtherTechnicianDurations((current) => ({ ...current, [technician.id]: isAdmin ? (hoursInputToMinutes(event.target.value) ?? 0) : Number(event.target.value) }))} className="w-16 rounded-md border border-border bg-panel px-1.5 py-1 text-right font-mono text-[10px] text-text" /></label>}</div>)}</div>
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

      {offlineMedia.length > 0 && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-2 text-[10.5px] text-amber">
          {offlineMedia.length} medya/rapor eki bağlantı gelince yüklenecek; kaydettiğinde güncelleme kuyruğa alınır.
        </div>
      )}
      <ReportAttachmentPicker attachments={reportAttachments} onChange={setReportAttachments} onOfflineFile={handleOfflineReportFile} onBusyChange={setReportAttachmentBusy} onRemove={removeReportAttachment} disabled={busy || mediaBusy} />
      {photos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {photos.map((p, idx) => (
            <div key={idx} className="relative">
              <button
                type="button"
                onClick={() => onPhotoClick && onPhotoClick(getPhotoSrc(p, offlinePreviews, transientPhotoUrls))}
                className="block hover:scale-105 transition-transform"
                aria-label="Fotoğrafı büyüt"
              >
                <NextImage src={getPhotoSrc(p, offlinePreviews, transientPhotoUrls)} width={48} height={48} unoptimized className="w-12 h-12 rounded-lg object-cover border border-border" alt="" />
              </button>
              <button
                onClick={() => removePhoto(idx)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-panel2 border border-border text-[9px] hover:bg-red hover:text-white transition"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
        {mediaBusy ? "Fotoğraf işleniyor..." : "📷 Fotoğraf ekle"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || mediaBusy} onChange={addPhotos} className="hidden" />
      </label>

      {videos.length > 0 && (
        <div className="flex flex-col gap-1">
          {videos.map((v, idx) => (
            <div key={idx} className="flex items-center justify-between bg-panel2 rounded-lg px-2.5 py-1.5 text-[11px] text-muted">
              🎬 {v.filename || "Video"}
              <button onClick={() => removeVideo(idx)} className="text-red hover:scale-110 transition">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
        {mediaBusy ? "Video yükleniyor..." : "🎬 Video ekle (max 100MB)"}
        <input type="file" accept="video/*" multiple disabled={busy || mediaBusy} onChange={addVideos} className="hidden" />
      </label>

      <div className="flex gap-2 mt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">
          Vazgeç
        </button>
        <button
          onClick={save}
          disabled={busy || mediaBusy || reportAttachmentBusy}
          className="flex-1 py-2.5 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition"
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
