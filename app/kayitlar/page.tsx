"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { queueRecord, type QueuedMedia } from "@/lib/offlineQueue";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import Lightbox from "@/components/Lightbox";
import ReportAttachmentPicker from "@/components/ReportAttachmentPicker";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ReportAttachment } from "@/lib/types";
import { formatReportAttachmentSize } from "@/lib/reportAttachments";
import { engineSortKey } from "@/lib/status";
import { invalidateMaintenancePanel } from "@/lib/maintenancePanel";
import { canTechnicianWorkOnType, EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME, TECHNICIAN_TYPE_LABELS, type TechnicianOption } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, formatDateTimeLocal, formatMaintenanceDuration, getMaintenanceRecordDate, normalizeTechnicianContributionDuration, TIME_TRACKING_VERSION } from "@/lib/maintenanceTime";

interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface MaintenanceType {
  _id: string;
  key: string;
  label: string;
  default_period_hours: number;
  work_domains?: Array<"mechanical" | "electrical" | "commissioning">;
  allow_electromechanical_support?: boolean;
  allow_electromechanical_responsible?: boolean;
  engine_scope?: "all" | "explicit";
  engine_states?: Record<string, { period_hours?: number; last_maintenance_hour?: number; tracking_source?: string }>;
}

interface VideoItem {
  url?: string;
  filename?: string;
  mime?: string;
  data_b64?: string;
}

interface MaintenanceRecord {
  _id: string;
  engine_id: string;
  engine_name: string;
  type_key: string;
  type_label: string;
  hour_at_completion: number;
  time_tracking_version?: 2;
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  technician_note?: string;
  photos_b64?: string[];
  photos?: string[];
  videos?: VideoItem[];
  pressure_reading?: number;
  created_at: string;
  technician_name: string;
  technician_id: string;
  technician_type?: "mekanik" | "elektromekanik";
  technician_source?: "internal" | "external_service";
  external_service_name?: string;
  other_technician_ids?: string[];
  other_technicians?: Array<{ id: string; full_name: string; technician_type?: "mekanik" | "elektromekanik" }>;
  extra_types?: Array<{ type_key: string; type_label: string }>;
  technician_contributions?: Array<{ id: string; full_name: string; technician_type?: "mekanik" | "elektromekanik"; contribution_role: "responsible" | "support"; duration_minutes: number }>;

  checklist?: Array<{ label: string; completed: boolean }>;
  completion_confirmed_at?: string;
  manager_confirmation_status?: "pending" | "confirmed";
  manager_confirmed_at?: string;
  manager_confirmed_by_id?: string;
  manager_confirmed_by_name?: string;
  manager_confirmed_by_role?: string;
  group_id?: string | null;
  group_types?: Array<{ type_key: string; type_label: string }>;
  report_attachments?: ReportAttachment[];
}

function compressImage(file: File, maxDim = 720, quality = 0.65): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const release = () => {
          img.onload = null;
          img.onerror = null;
          img.removeAttribute("src");
          canvas.width = 1;
          canvas.height = 1;
        };
        if (!ctx) {
          release();
          reject(new Error("Fotoğraf işlenemedi."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          release();
          if (!blob) {
            reject(new Error("Fotoğraf sıkıştırılamadı."));
            return;
          }
          resolve(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Fotoğraf okunamadı."));
      if (typeof e.target?.result !== "string") {
        reject(new Error("Fotoğraf okunamadı."));
        return;
      }
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Fotoğraf okunamadı."));
    reader.readAsDataURL(file);
  });
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

function getPhotoSrc(photo: string, previews: Record<string, string> = {}): string {
  if (photo.startsWith("offline:")) return previews[photo.slice("offline:".length)] || "";
  return photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("data:")
    ? photo
    : `data:image/jpeg;base64,${photo}`;
}

function makeOfflineId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getVideoSrc(v: VideoItem | string, previews: Record<string, string> = {}): string {
  const url = typeof v === "string" ? v : v?.url;
  if (url?.startsWith("offline:")) return previews[url.slice("offline:".length)] || "";
  if (url) return url;
  if (typeof v !== "string" && v?.data_b64) return `data:${v.mime || "video/mp4"};base64,${v.data_b64}`;
  return "";
}

function toLocalDateTimeInput(value: string | Date | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatDateTimeLocal(date) : "";
}

function technicianLabel(record: MaintenanceRecord): string {
  const name = record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID
    ? record.technician_name || EXTERNAL_SERVICE_TECHNICIAN_NAME
    : record.technician_name || "—";
  if (record.technician_source === "external_service" || !record.technician_type) return name;
  return `${name} · ${TECHNICIAN_TYPE_LABELS[record.technician_type] || "Mekanik teknisyen"}`;
}

interface ConfirmationContributionRow {
  id: string;
  full_name: string;
  technician_type?: "mekanik" | "elektromekanik";
  contribution_role: "responsible" | "support";
  duration_minutes?: number;
}

function confirmationContributionRows(record: MaintenanceRecord): ConfirmationContributionRow[] {
  if (record.technician_contributions?.length) return record.technician_contributions;
  if (record.technician_source === "external_service") return [];
  const fallbackDuration = typeof record.maintenance_duration_minutes === "number" ? record.maintenance_duration_minutes : undefined;
  const rows: ConfirmationContributionRow[] = [{
    id: record.technician_id,
    full_name: record.technician_name || "Sorumlu teknisyen",
    technician_type: record.technician_type,
    contribution_role: "responsible",
    duration_minutes: fallbackDuration,
  }];
  for (const technician of record.other_technicians || []) {
    if (!technician?.id || !technician.full_name) continue;
    rows.push({ ...technician, contribution_role: "support" });
  }
  return rows;
}

function minutesToHoursInput(minutes: number | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "";
  return String(Number((minutes / 60).toFixed(2)));
}

function hoursInputToMinutes(value: string): number | null {
  const hours = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const minutes = Math.round(hours * 60);
  return minutes > 0 && minutes <= 366 * 24 * 60 ? minutes : null;
}

function maintenanceDayKey(record: MaintenanceRecord): string {
  const date = getMaintenanceRecordDate(record.maintenance_start_at, record.created_at);
  if (!date || !Number.isFinite(date.getTime())) return "unknown";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function maintenanceDayLabel(key: string): string {
  if (key === "unknown") return "Tarihi bilinmeyen kayıtlar";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const difference = Math.round((startOfToday - date.getTime()) / 86_400_000);
  if (difference === 0) return "Bugün";
  if (difference === 1) return "Dün";
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

interface EditFormProps {
  record: MaintenanceRecord;
  onCancel: () => void;
  onSaved: () => void;
  onPhotoClick: (src: string) => void;
  isAdmin: boolean;
}

function EditForm({ record, onCancel, onSaved, onPhotoClick, isAdmin }: EditFormProps) {
  const [hours, setHours] = useState<number | string>(record.hour_at_completion);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState(toLocalDateTimeInput(record.maintenance_start_at));
  const [maintenanceEndAt, setMaintenanceEndAt] = useState(toLocalDateTimeInput(record.maintenance_end_at));
  const [techNote, setTechNote] = useState(record.technician_note || "");
  const [pressure, setPressure] = useState<number | string>(record.pressure_reading ?? "");
  const [photos, setPhotos] = useState<string[]>(record.photos || record.photos_b64 || []);
  const [videos, setVideos] = useState<VideoItem[]>(record.videos || []);
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
  const previewUrlsRef = useRef<Record<string, string>>({});
  const historicalTypeKeys = useMemo(() => new Set([record.type_key, ...(record.extra_types || []).map((extra) => extra.type_key), ...groupTypes.map((type) => type.type_key)]), [record.type_key, record.extra_types, groupTypes]);
  const selectedTypeKeys = useMemo(() => new Set([...historicalTypeKeys, ...extraKeys]), [historicalTypeKeys, extraKeys]);
  const selectedMaintenanceTypes = maintenanceTypes.filter((type) => selectedTypeKeys.has(type.key));
  const availableExtraTypes = maintenanceTypes.filter((type) => !historicalTypeKeys.has(type.key));
  const trackedExtraTypeKeys = useMemo(() => new Set(maintenanceTypes.filter((type) => type.engine_scope === "all" || Boolean(type.engine_states?.[record.engine_id])).map((type) => type.key)), [maintenanceTypes, record.engine_id]);
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
    const uploaded: string[] = [];
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
        const formData = new FormData();
        formData.append("file", new File([compressed], photoName, { type: "image/jpeg" }));
        formData.append("folder", "photos");
        const response = await withTimeout(
          fetch("/api/blob/upload-server", { method: "POST", body: formData }),
          60_000,
          "Fotoğraf yükleme zaman aşımına uğradı.",
        );
        const result = await response.json() as { url?: string; error?: string };
        if (!response.ok || !result.url) throw new Error(result.error || "Fotoğraf yüklenemedi.");
        uploaded.push(result.url);
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
    setPhotos((p) => [...p, ...uploaded]);
    e.target.value = "";
  }

  async function addVideos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
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
          uploadVideoChunked(f),
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
    e.target.value = "";
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
      <ReportAttachmentPicker attachments={reportAttachments} onChange={setReportAttachments} onOfflineFile={handleOfflineReportFile} onBusyChange={setReportAttachmentBusy} onRemove={removeReportAttachment} disabled={busy} />
      {photos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {photos.map((p, idx) => (
            <div key={idx} className="relative">
              <button
                type="button"
                onClick={() => onPhotoClick && onPhotoClick(getPhotoSrc(p, offlinePreviews))}
                className="block hover:scale-105 transition-transform"
                aria-label="Fotoğrafı büyüt"
              >
                <img src={getPhotoSrc(p, offlinePreviews)} className="w-12 h-12 rounded-lg object-cover border border-border" alt="" />
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
        📷 Fotoğraf ekle
        <input type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
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
        🎬 Video ekle (max 100MB)
        <input type="file" accept="video/*" multiple onChange={addVideos} className="hidden" />
      </label>

      <div className="flex gap-2 mt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">
          Vazgeç
        </button>
        <button
          onClick={save}
          disabled={busy || reportAttachmentBusy}
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

export default function KayitlarPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mediaLoadingId, setMediaLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState("Tümü");
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<{ src: string; filename: string } | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);
  const [confirmationRecord, setConfirmationRecord] = useState<MaintenanceRecord | null>(null);
  const [confirmationDurations, setConfirmationDurations] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmationFilter, setConfirmationFilter] = useState<"all" | "pending">("all");

  async function load(requestedPage = 1) {
    const params = new URLSearchParams({ page: String(requestedPage), page_size: "25" });
    if (engineFilter !== "Tümü") params.set("engine_id", engineFilter);
    if (typeFilter !== "Tümü") params.set("type_label", typeFilter);
    if (search.trim()) params.set("search", search.trim());
    if (user?.role === "yonetici" && confirmationFilter === "pending") params.set("confirmation_status", "pending");
    const requests: Promise<Response>[] = [fetch(`/api/records?${params}`)];
    if (engines.length === 0) requests.push(fetch("/api/engines"), fetch("/api/maintenance-types"));
    const [recRes, engRes, typeRes] = await Promise.all(requests);
    if (recRes.status === 401) { router.push("/login"); return; }
    const recordData = await recRes.json();
    setRecords(recordData.records || []);
    setTotal(recordData.total || 0);
    setPage(recordData.page || requestedPage);
    setTotalPages(recordData.totalPages || 1);
    if (engRes && typeRes) {
      setEngines(await engRes.json());
      setTypes(await typeRes.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { load(1); }, search.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineFilter, typeFilter, search, confirmationFilter]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const typeLabels = useMemo(() => [...types].map((t) => t.label).sort((a, b) => a.localeCompare(b, "tr")), [types]);

  const filteredRecords = records;
  const recordGroups = useMemo(() => {
    const groups = new Map<string, MaintenanceRecord[]>();
    filteredRecords.forEach((record) => {
      const key = maintenanceDayKey(record);
      groups.set(key, [...(groups.get(key) || []), record]);
    });
    return [...groups.entries()].map(([key, groupRecords]) => ({ key, label: maintenanceDayLabel(key), records: groupRecords }));
  }, [filteredRecords]);

  const confirmationRows = confirmationRecord ? confirmationContributionRows(confirmationRecord) : [];
  const confirmationTotalMinutes = confirmationRows.reduce((total, row) => total + (hoursInputToMinutes(confirmationDurations[row.id] || "") || 0), 0);

  async function loadRecordMedia(record: MaintenanceRecord) {
    if (record.videos !== undefined && (record.photos !== undefined || record.photos_b64 !== undefined)) return record;
    setMediaLoadingId(record._id);
    try {
      const res = await fetch(`/api/records/${record._id}?include_media=true`);
      if (!res.ok) throw new Error("Medya yüklenemedi");
      const detail = await res.json() as MaintenanceRecord;
      setRecords((current) => current.map((item) => item._id === record._id ? detail : item));
      return detail;
    } catch {
      toast.error("Kayıt detayları yüklenemedi.");
      return null;
    } finally {
      setMediaLoadingId(null);
    }
  }

  async function openEdit(record: MaintenanceRecord) {
    const detail = await loadRecordMedia(record);
    if (detail) setEditingId(detail._id);
  }

  async function openDetails(record: MaintenanceRecord) {
    const detail = await loadRecordMedia(record);
    if (detail) setSelectedRecord(detail);
  }

  function openConfirmation(record: MaintenanceRecord) {
    if (user?.role !== "yonetici" || record.manager_confirmation_status !== "pending") return;
    const rows = confirmationContributionRows(record);
    setConfirmationRecord(record);
    setConfirmationDurations(Object.fromEntries(rows.map((row) => [row.id, minutesToHoursInput(row.duration_minutes)])));
  }

  async function confirmRecord(record: MaintenanceRecord, durationInputs: Record<string, string>) {
    if (user?.role !== "yonetici" || record.manager_confirmation_status !== "pending" || confirmingId === record._id) return;
    const rows = confirmationContributionRows(record);
    const isExternalService = record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID;
    const technicianContributions = isExternalService ? [] : rows.map((row) => ({
      id: row.id,
      duration_minutes: hoursInputToMinutes(durationInputs[row.id] || "") ?? -1,
    }));
    if (!isExternalService && technicianContributions.some((item) => item.duration_minutes <= 0)) {
      toast.error("Teyit için tüm çalışan kişilerin saatini 0’dan büyük girin.");
      return;
    }
    if (!window.confirm("Kişi bazlı çalışma sürelerini kontrol ettim ve bu bakım kaydını teyit etmek istiyorum.")) return;
    setConfirmingId(record._id);
    try {
      const res = await fetch(`/api/records/${record._id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technician_contributions: technicianContributions }),
      });
      const data = await res.json().catch(() => ({})) as { confirmed_at?: string; confirmed_by_name?: string; confirmed_ids?: string[]; technician_contributions?: NonNullable<MaintenanceRecord["technician_contributions"]>; error?: string };
      if (!res.ok) {
        toast.error(data.error || "Bakım kaydı teyit edilemedi.");
        return;
      }
      const confirmedIds = new Set(data.confirmed_ids?.length ? data.confirmed_ids : [record._id]);
      const applyConfirmation = (item: MaintenanceRecord): MaintenanceRecord => confirmedIds.has(item._id) ? {
        ...item,
        manager_confirmation_status: "confirmed",
        manager_confirmed_at: data.confirmed_at || new Date().toISOString(),
        manager_confirmed_by_id: user.id || user._id,
        manager_confirmed_by_name: data.confirmed_by_name || user.full_name,
        manager_confirmed_by_role: user.role,
        ...(data.technician_contributions ? { technician_contributions: data.technician_contributions } : {}),
      } : item;
      setRecords((current) => current.map(applyConfirmation));
      setSelectedRecord((current) => current ? applyConfirmation(current) : current);
      setConfirmationRecord(null);
      setConfirmationDurations({});
      toast.success("Kişi bazlı çalışma süreleri kaydedildi ve bakım teyit edildi.");
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch {
      toast.error("Teyit işlemi sırasında sunucu hatası oluştu.");
    } finally {
      setConfirmingId(null);
    }
  }

  async function doDelete(id: string) {
    const loadingToast = toast.loading("Kayıt siliniyor...");
    try {
      const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Kayıt silindi! 🗑️");
        invalidateMaintenancePanel();
        window.dispatchEvent(new Event("notifications:refresh"));
        setConfirmDeleteId(null);
        load(page);
      } else {
        toast.error("Kayıt silinemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Kayıtları" subtitle="" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-3" />
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Kayıtları" subtitle={`${total.toLocaleString("tr-TR")} kayıt bulundu · Sayfa ${page}/${totalPages}`} />
      <div className="px-4 py-4">
        <div className="mb-3 rounded-card border border-border bg-panel p-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm" aria-hidden="true">🔍</span>
            <input
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Motor, tür veya teknisyen ara..."
              aria-label="Bakım kaydı ara"
              className="w-full min-w-0 bg-panel2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
          </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={engineFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setEngineFilter(e.target.value)}
            className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition"
          >
            <option value="Tümü">Tüm Motorlar</option>
            {sortedEngines.map((e) => (
              <option key={e._id} value={e._id}>
                {e.name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}
            className="min-w-0 bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition"
          >
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        </div>

        {user?.role === "yonetici" && <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmationFilter((current) => current === "pending" ? "all" : "pending")}
            className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition ${confirmationFilter === "pending" ? "border-amber/60 bg-amber/15 text-amber" : "border-border bg-panel2 text-muted hover:border-amber/50 hover:text-amber"}`}
          >
            {confirmationFilter === "pending" ? "✓ Teyit kuyruğu açık" : "Teyit bekleyenleri göster"}
          </button>
          {confirmationFilter === "pending" && <span className="text-[10px] text-faint">Yalnızca yönetici incelemesi bekleyen yeni kayıtlar</span>}
        </div>}

        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-muted">Kayıt bulunamadı.</p>
            {(search || engineFilter !== "Tümü" || typeFilter !== "Tümü" || confirmationFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setEngineFilter("Tümü");
                  setTypeFilter("Tümü");
                  setConfirmationFilter("all");
                }}
                className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel transition"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        ) : (
          <>
          <div className="flex flex-col gap-4">
            {recordGroups.map((group) => (
              <section key={group.key}>
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-border px-1 pb-1.5">
                  <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-muted">{group.label}</h2>
                  <span className="text-[10px] text-faint">{group.records.length} kayıt</span>
                </div>
                <div className="flex flex-col gap-2">
            {group.records.map((r) => {
              const photos = r.photos || r.photos_b64 || [];
              const videos = r.videos || [];
              const showMedia = !r.group_id || photos.length > 0 || videos.length > 0;
              // user._id veya user.id kontrolü (MongoDB standartlarına göre _id kullanılır)
              const canEdit = user && (user.role === "yonetici" || user.id === r.technician_id || user._id === r.technician_id);
              return (
                <div key={r._id} className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
                  {!photos.length && !videos.length && (
                    <button
                      type="button"
                      onClick={() => loadRecordMedia(r)}
                      disabled={mediaLoadingId === r._id}
                      className="mb-2 rounded-lg border border-border px-2.5 py-1.5 text-[10.5px] font-bold text-muted hover:border-teal/40 hover:text-teal disabled:opacity-50"
                    >
                      {mediaLoadingId === r._id ? "Medya yükleniyor..." : "📎 Medyayı görüntüle"}
                    </button>
                  )}
                  {showMedia && photos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {photos.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedPhoto(getPhotoSrc(p))}
                          className="hover:scale-105 transition-transform"
                          aria-label="Fotoğrafı büyüt"
                        >
                          <img src={getPhotoSrc(p)} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                  {showMedia && videos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {videos.map((v, idx) => {
                        const videoSrc = getVideoSrc(v);
                        if (!videoSrc) return null;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedVideo({ src: videoSrc, filename: v.filename || "Video" })}
                            className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-panel2 hover:scale-105 transition-transform"
                            aria-label={`${v.filename || "Video"} videosunu oynat`}
                          >
                            <video muted preload="metadata" className="w-full h-full object-cover pointer-events-none">
                              <source src={videoSrc} />
            </video>
                            <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white text-xl">▶</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-text">{r.engine_name}</div>
                      <div className="mt-0.5 truncate text-[11px] font-semibold text-teal">{r.type_label}</div>
                    </div>
                    {r.manager_confirmation_status === "confirmed" ? <span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2 py-0.5 text-[9px] font-bold text-green">✓ Teyitli</span> : r.manager_confirmation_status === "pending" ? <span className="flex-shrink-0 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[9px] font-bold text-amber">Teyit bekliyor</span> : <span className="flex-shrink-0 rounded-full border border-border bg-panel2 px-2 py-0.5 text-[9px] font-bold text-faint">Eski kayıt</span>}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    {getMaintenanceRecordDate(r.maintenance_start_at, r.created_at)?.toLocaleDateString("tr-TR") || "—"} · {r.hour_at_completion.toLocaleString("tr-TR")} sa · {technicianLabel(r)}
                  </div>
                  {(r.maintenance_start_at || r.maintenance_end_at || r.maintenance_duration_minutes != null) && <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-teal"><span>Başlangıç: {r.maintenance_start_at ? new Date(r.maintenance_start_at).toLocaleString("tr-TR") : "—"}</span><span>Bitiş: {r.maintenance_end_at ? new Date(r.maintenance_end_at).toLocaleString("tr-TR") : "—"}</span><span>Süre: {formatMaintenanceDuration(r.maintenance_duration_minutes)}</span></div>}
                  {r.pressure_reading != null && <div className="text-[11.5px] text-muted mt-1">📈 Fark Basıncı: {r.pressure_reading} bar</div>}
                  {r.technician_note && <div className="text-[11.5px] text-muted mt-1">🗒️ {r.technician_note}</div>}
                  {r.other_technicians?.length ? <div className="mt-1 text-[11px] text-muted">👥 Ekip: {r.other_technicians.map((technician) => technician.full_name).join(", ")}</div> : null}
                  {r.report_attachments?.length ? <div className="mt-1 text-[11px] text-purple-200">📄 {r.report_attachments.length} detaylı rapor eki</div> : null}

                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => void openDetails(r)}
                      className="text-[11px] font-bold text-amber border border-amber/40 rounded-lg px-2.5 py-1.5 hover:bg-amber/10 transition"
                    >
                      🔎 Detay
                    </button>
                    {user?.role === "yonetici" && r.manager_confirmation_status === "pending" && <button
                      type="button"
                      onClick={() => openConfirmation(r)}
                      disabled={confirmingId === r._id}
                      className="text-[11px] font-bold text-[#071a12] bg-green rounded-lg px-2.5 py-1.5 hover:brightness-110 transition disabled:opacity-50"
                    >
                      {confirmingId === r._id ? "Teyit ediliyor..." : "✓ Teyit et"}
                    </button>}
                    {canEdit && (
                      <>
                        <button
                          onClick={() => editingId === r._id ? setEditingId(null) : void openEdit(r)}
                          className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5 hover:bg-teal/10 transition"
                        >
                          ✏️ Düzenle
                        </button>
                        {confirmDeleteId === r._id ? (
                          <>
                            <button
                              onClick={() => doDelete(r._id)}
                              className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-1.5 hover:brightness-110 transition"
                            >
                              Evet, Sil
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5 hover:bg-panel2 transition"
                            >
                              Vazgeç
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(r._id)}
                            className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5 hover:bg-red/10 transition"
                          >
                            🗑️ Sil
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {editingId === r._id && (
                    <EditForm
                      record={r}
                      onPhotoClick={(src: string) => setSelectedPhoto(src)}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        load(page);
                      }}
                      isAdmin={user?.role === "yonetici"}
                    />
                  )}
                </div>
              );
            })}
                </div>
              </section>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-panel p-2">
              <button
                type="button"
                onClick={() => load(page - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted disabled:opacity-40"
              >
                ← Önceki
              </button>
              <span className="text-[11px] text-faint">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => load(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted disabled:opacity-40"
              >
                Sonraki →
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {/* Yönetici kişi bazlı süre teyit modalı */}
      {confirmationRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="Kişi bazlı çalışma süresi teyidi">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-panel p-4 shadow-2xl md:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-0">
                <div className="text-base font-extrabold text-text">Teyit öncesi çalışma süreleri</div>
                <div className="mt-0.5 truncate text-[11px] text-muted">{confirmationRecord.engine_name} · {confirmationRecord.type_label}</div>
              </div>
              <button type="button" onClick={() => setConfirmationRecord(null)} className="h-8 w-8 flex-shrink-0 rounded-full border border-border bg-panel2 text-text hover:bg-red hover:text-white" aria-label="Teyit penceresini kapat">✕</button>
            </div>
            <div className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-[11px] leading-relaxed text-amber">
              <b>Önemli:</b> Toplam bakım süresi ile kişi katkı süresi aynı olmak zorunda değildir. Çok günlük bakım ve mesai durumlarında her çalışan için gerçek toplam süreyi ayrı girin. Değerler saat cinsindendir; örnek: <b>8,5</b> = 8 saat 30 dakika.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Motor saati</div><div className="mt-0.5 font-mono font-bold text-amber">{confirmationRecord.hour_at_completion.toLocaleString("tr-TR")} sa</div></div>
              <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Geçen bakım süresi</div><div className="mt-0.5 font-bold text-teal">{formatMaintenanceDuration(confirmationRecord.maintenance_duration_minutes)}</div></div>
            </div>
            {confirmationRecord.technician_source === "external_service" || confirmationRecord.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? (
              <div className="mt-3 rounded-xl border border-purple-400/30 bg-purple-400/10 p-3 text-[11px] text-purple-100"><b>Dış hizmet kaydı</b><div className="mt-1 text-[10.5px] text-purple-200">Bu kayıtta kayıtlı personel bulunmadığı için kişi bazlı çalışma süresi girilmeyecek. Kontrol ettikten sonra teyit edebilirsin.</div></div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {confirmationRows.map((row) => (
                  <label key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel2 px-3 py-2.5">
                    <span className="min-w-0"><span className="block truncate text-[12px] font-bold text-text">{row.full_name}</span><span className="mt-0.5 block text-[10px] text-faint">{row.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · {TECHNICIAN_TYPE_LABELS[row.technician_type || "mekanik"] || "Mekanik teknisyen"}</span></span>
                    <span className="flex flex-shrink-0 items-center gap-1.5 text-[10px] text-muted"><input type="number" min="0.25" max={366 * 24} step="0.25" required value={confirmationDurations[row.id] || ""} onChange={(event) => setConfirmationDurations((current) => ({ ...current, [row.id]: event.target.value }))} className="w-24 rounded-lg border border-border bg-panel px-2 py-2 text-right font-mono text-[12px] text-text outline-none focus:border-amber" aria-label={`${row.full_name} çalışma süresi (saat)`} /> saat</span>
                  </label>
                ))}
              </div>
            )}
            {confirmationRecord.technician_source !== "external_service" && confirmationRecord.technician_id !== EXTERNAL_SERVICE_TECHNICIAN_ID && <div className="mt-3 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-[10.5px] text-teal">Toplam kişi katkısı: <b>{formatMaintenanceDuration(confirmationTotalMinutes)}</b> · Mesai ve farklı günlerdeki çalışma bu toplamda birlikte tutulur.</div>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmationRecord(null)} className="flex-1 rounded-xl border border-border py-2.5 text-[12px] font-bold text-muted hover:bg-panel2">Vazgeç</button>
              <button type="button" onClick={() => void confirmRecord(confirmationRecord, confirmationDurations)} disabled={confirmingId === confirmationRecord._id} className="flex-1 rounded-xl bg-green py-2.5 text-[12px] font-bold text-[#071a12] disabled:opacity-50">{confirmingId === confirmationRecord._id ? "Teyit ediliyor..." : "✓ Süreleri kontrol et ve teyit et"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bakım Kaydı Detay Modalı */}
      {selectedRecord && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4" role="dialog" aria-modal="true" aria-label="Bakım kaydı detayı">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl md:rounded-2xl border border-border bg-panel p-4 shadow-2xl animate-fade-in">
            <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="text-base font-extrabold text-text">{selectedRecord.type_label}</div>
                <div className="mt-0.5 text-[11px] text-muted">{selectedRecord.engine_name} · {getMaintenanceRecordDate(selectedRecord.maintenance_start_at, selectedRecord.created_at)?.toLocaleDateString("tr-TR") || "—"}</div>
              </div>
              <button type="button" onClick={() => setSelectedRecord(null)} className="h-8 w-8 rounded-full border border-border bg-panel2 text-text hover:bg-red hover:text-white" aria-label="Detayı kapat">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Motor saati</div><div className="mt-0.5 font-mono font-bold text-amber">{selectedRecord.hour_at_completion.toLocaleString("tr-TR")} sa</div></div>
              <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Sorumlu teknisyen</div><div className="mt-0.5 font-semibold text-text">{technicianLabel(selectedRecord)}</div><div className="mt-0.5 text-[9.5px] text-faint">{TECHNICIAN_TYPE_LABELS[selectedRecord.technician_type || "mekanik"]}</div></div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 text-[11px]">
              <div className="rounded-lg border border-teal/30 bg-teal/10 p-2"><div className="text-faint">Başlangıç</div><div className="mt-0.5 font-mono text-teal">{selectedRecord.maintenance_start_at ? new Date(selectedRecord.maintenance_start_at).toLocaleString("tr-TR") : "—"}</div></div>
              <div className="rounded-lg border border-teal/30 bg-teal/10 p-2"><div className="text-faint">Bitiş</div><div className="mt-0.5 font-mono text-teal">{selectedRecord.maintenance_end_at ? new Date(selectedRecord.maintenance_end_at).toLocaleString("tr-TR") : "—"}</div></div>
              <div className="rounded-lg border border-amber/30 bg-amber/10 p-2"><div className="text-faint">Toplam bakım süresi</div><div className="mt-0.5 font-bold text-amber">{formatMaintenanceDuration(selectedRecord.maintenance_duration_minutes)}</div></div>
            </div>
            {selectedRecord.technician_contributions?.length ? <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal"><b>Teknisyen katkıları:</b><div className="mt-1 flex flex-col gap-0.5">{selectedRecord.technician_contributions.map((contribution) => <span key={`${contribution.id}-${contribution.contribution_role}`}>{contribution.full_name} · {TECHNICIAN_TYPE_LABELS[contribution.technician_type || "mekanik"]} · {contribution.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · {formatMaintenanceDuration(contribution.duration_minutes)}</span>)}</div></div> : selectedRecord.other_technicians?.length ? <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal"><b>Bu bakımda çalışan diğer teknisyenler:</b> {selectedRecord.other_technicians.map((technician) => technician.full_name).join(", ")}</div> : null}
            {selectedRecord.manager_confirmation_status === "confirmed" ? <div className="mt-2 rounded-lg border border-green/30 bg-green/10 p-2 text-[11px] text-green"><b>✓ Yönetici teyidi:</b> {selectedRecord.manager_confirmed_by_name || "Yönetici"} · {selectedRecord.manager_confirmed_at ? new Date(selectedRecord.manager_confirmed_at).toLocaleString("tr-TR") : "Tarih bilgisi yok"}</div> : selectedRecord.manager_confirmation_status === "pending" ? <div className="mt-2 rounded-lg border border-amber/40 bg-amber/10 p-2 text-[11px] text-amber"><b>Teyit bekliyor:</b> Bu kayıt yönetici tarafından kontrol edilmelidir. {user?.role === "yonetici" && <button type="button" onClick={() => openConfirmation(selectedRecord)} disabled={confirmingId === selectedRecord._id} className="mt-2 w-full rounded-lg bg-green px-3 py-2 font-bold text-[#071a12] disabled:opacity-50">{confirmingId === selectedRecord._id ? "Teyit ediliyor..." : "✓ Kontrol ettim, teyit et"}</button>}</div> : <div className="mt-2 rounded-lg border border-border bg-panel2 p-2 text-[11px] text-faint"><b>Eski kayıt:</b> Bu kayıt yönetici teyit akışından önce oluşturulmuş.</div>}
            {selectedRecord.checklist?.length ? <div className="mt-2 rounded-lg border border-green/30 bg-green/10 p-2 text-[11px] text-green"><b>Bakım kanıtı:</b> Kontrol listesi tamamlandı{selectedRecord.completion_confirmed_at ? ` · ${new Date(selectedRecord.completion_confirmed_at).toLocaleString("tr-TR")}` : ""}<div className="mt-1 flex flex-col gap-0.5 text-[10px]">{selectedRecord.checklist.map((item) => <span key={item.label}>✓ {item.label}</span>)}</div></div> : null}
            {selectedRecord.pressure_reading != null && <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal">Fark basıncı: <b>{selectedRecord.pressure_reading} bar</b></div>}
            {selectedRecord.technician_note && <div className="mt-2 rounded-lg border border-border bg-panel2 p-2 text-[11px] leading-relaxed text-muted"><b className="text-text">Not:</b> {selectedRecord.technician_note}</div>}
            {selectedRecord.report_attachments?.length ? <div className="mt-4 rounded-xl border border-purple-400/30 bg-purple-400/5 p-3"><div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-purple-200">Detaylı rapor ekleri</div><div className="flex flex-col gap-1.5">{selectedRecord.report_attachments.map((attachment) => <a key={attachment.id} href={`/api/records/${selectedRecord._id}/attachments/${encodeURIComponent(attachment.id)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel2 px-2.5 py-2 text-[10.5px] text-text hover:border-purple-300"><span className="min-w-0 truncate font-bold">{attachment.filename}</span><span className="flex-shrink-0 text-[9px] text-faint">{attachment.mime === "application/pdf" ? "PDF" : attachment.mime.includes("spreadsheet") || attachment.mime.includes("excel") ? "Excel" : "Word"} · {formatReportAttachmentSize(attachment.size)} ↗</span></a>)}</div></div> : null}
            {((selectedRecord.photos || selectedRecord.photos_b64 || []).length > 0 || (selectedRecord.videos || []).length > 0) && (
              <div className="mt-4">
                <div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-muted">Medya</div>
                <div className="flex flex-wrap gap-2">
                  {(selectedRecord.photos || selectedRecord.photos_b64 || []).map((photo, index) => (
                    <button type="button" key={`detail-photo-${index}`} onClick={() => setSelectedPhoto(getPhotoSrc(photo))} className="overflow-hidden rounded-lg border border-border hover:scale-105 transition-transform">
                      <img src={getPhotoSrc(photo)} className="h-20 w-20 object-cover" alt={`Bakım fotoğrafı ${index + 1}`} />
                    </button>
                  ))}
                  {(selectedRecord.videos || []).map((video, index) => {
                    const src = getVideoSrc(video);
                    return src ? <button type="button" key={`detail-video-${index}`} onClick={() => setSelectedVideo({ src, filename: video.filename || "Video" })} className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-black text-2xl text-white">▶</button> : null;
                  })}
                </div>
              </div>
            )}
            <button type="button" onClick={() => setSelectedRecord(null)} className="mt-4 w-full rounded-xl border border-border py-2.5 text-[12px] font-bold text-muted hover:bg-panel2">Kapat</button>
          </div>
        </div>
      )}

      {/* Video Oynatıcı Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={selectedVideo.filename}
        >
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setSelectedVideo(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-panel text-text text-lg hover:bg-red hover:text-white transition"
              aria-label="Videoyu kapat"
            >
              ✕
            </button>
            <video controls autoPlay className="w-full max-h-[80vh] rounded-xl border border-border bg-black">
              <source src={selectedVideo.src} />
            </video>
          </div>
        </div>
      )}

      {/* Resim Büyütme Penceresi */}
      <Lightbox src={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      <BottomNav />
    </div>
  );
}
