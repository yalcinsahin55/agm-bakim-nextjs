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
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME } from "@/lib/technicians";
import { calculateMaintenanceDurationFromDates, formatDateTimeLocal, formatMaintenanceDuration, TIME_TRACKING_VERSION } from "@/lib/maintenanceTime";

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
  technician_source?: "internal" | "external_service";
  external_service_name?: string;
  other_technician_ids?: string[];
  other_technicians?: Array<{ id: string; full_name: string }>;
  checklist?: Array<{ label: string; completed: boolean }>;
  completion_confirmed_at?: string;
  manager_confirmation_status?: "pending" | "confirmed";
  manager_confirmed_at?: string;
  manager_confirmed_by_id?: string;
  manager_confirmed_by_name?: string;
  manager_confirmed_by_role?: string;
  group_id?: string | null;
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
        if (!ctx) return reject(new Error("Fotoğraf işlenemedi."));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Fotoğraf sıkıştırılamadı."));
          resolve(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Fotoğraf okunamadı."));
      img.src = e.target?.result as string;
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
  return record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID
    ? record.technician_name || EXTERNAL_SERVICE_TECHNICIAN_NAME
    : record.technician_name || "—";
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
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState<Record<string, string>>({});
  const [technicians, setTechnicians] = useState<Array<{ id: string; full_name: string }>>([]);
  const [technicianSource, setTechnicianSource] = useState<"internal" | "external_service">(record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? "external_service" : "internal");
  const [externalServiceName, setExternalServiceName] = useState(record.external_service_name || "");
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState(record.technician_id);
  const [otherTechnicianIds, setOtherTechnicianIds] = useState<string[]>(record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID ? [] : record.other_technician_ids || []);
  const [busy, setBusy] = useState(false);
  const previewUrlsRef = useRef<Record<string, string>>({});

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
      .then(async (response) => { if (response.ok) setTechnicians(await response.json() as Array<{ id: string; full_name: string }>); })
      .catch(() => {});
  }, []);

  function removePhoto(index: number): void {
    const photo = photos[index];
    const id = photo?.startsWith("offline:") ? photo.slice("offline:".length) : "";
    if (id) {
      revokeOfflinePreview(id);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
    }
    setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index));
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
      } catch (err: any) {
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
          createOfflinePreview(id, f);
          setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name, mime: f.type || "video/mp4" }]);
          continue;
        }
        console.error("Video yükleme hatası:", err);
        toast.error(`${f.name} yüklenemedi: ${err?.message ? err.message.slice(0, 100) : "bilinmeyen hata"}`);
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
      pressure_reading: pressure !== "" ? Number(pressure) : undefined,
      other_technician_ids: technicianSource === "external_service" ? [] : otherTechnicianIds,
      technician_source: technicianSource,
      external_service_name: technicianSource === "external_service" ? externalServiceName.trim() || undefined : undefined,
      responsible_technician_id: isAdmin && technicianSource !== "external_service" ? responsibleTechnicianId : undefined,
    };
    try {
      if (!navigator.onLine || offlineMedia.length > 0) {
        await queueRecord(payload, offlineMedia, { method: "PATCH", endpoint: `/api/records/${record._id}` });
        toast.dismiss(loadingToast);
        toast.success(navigator.onLine ? "Güncelleme senkronizasyon kuyruğuna alındı." : "İnternet yok. Güncelleme güvenle kuyruğa alındı.");
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
        </> : <select value={responsibleTechnicianId} onChange={(event) => { const nextId = event.target.value; setResponsibleTechnicianId(nextId); setOtherTechnicianIds((current) => current.filter((id) => id !== nextId)); }} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-amber">
          {record.technician_id !== EXTERNAL_SERVICE_TECHNICIAN_ID && !technicians.some((technician) => technician.id === record.technician_id) && <option value={record.technician_id}>{record.technician_name || "Mevcut sorumlu"} (mevcut)</option>}
          {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.full_name}</option>)}
        </select>}
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

      {technicianSource !== "external_service" && technicians.filter((technician) => technician.id !== responsibleTechnicianId).length > 0 && <div className="rounded-lg border border-teal/30 bg-teal/5 p-2.5">
        <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bu bakımda çalışan diğer teknisyenler</div>
        <div className="mt-0.5 text-[10px] text-faint">Sorumlu teknisyen dışında bakıma katılanları seç.</div>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">{technicians.filter((technician) => technician.id !== responsibleTechnicianId).map((technician) => <label key={technician.id} className="flex items-center gap-2 rounded-lg bg-panel2 px-2 py-1.5 text-[11px] text-text"><input type="checkbox" checked={otherTechnicianIds.includes(technician.id)} onChange={(event) => setOtherTechnicianIds((current) => event.target.checked ? [...new Set([...current, technician.id])] : current.filter((id) => id !== technician.id))} />{technician.full_name}</label>)}</div>
      </div>}

      {offlineMedia.length > 0 && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-2 text-[10.5px] text-amber">
          {offlineMedia.length} medya bağlantı gelince yüklenecek; kaydettiğinde güncelleme kuyruğa alınır.
        </div>
      )}
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
          disabled={busy}
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

  async function loadRecordMedia(record: MaintenanceRecord) {
    if (record.videos !== undefined && (record.photos !== undefined || record.photos_b64 !== undefined)) return record;
    setMediaLoadingId(record._id);
    try {
      const res = await fetch(`/api/records/${record._id}`);
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

  async function confirmRecord(record: MaintenanceRecord) {
    if (user?.role !== "yonetici" || record.manager_confirmation_status !== "pending" || confirmingId === record._id) return;
    if (!window.confirm("Bu bakım kaydını kontrol ettim ve yönetici olarak teyit etmek istiyorum.")) return;
    setConfirmingId(record._id);
    try {
      const res = await fetch(`/api/records/${record._id}/confirm`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { confirmed_at?: string; confirmed_by_name?: string; confirmed_ids?: string[]; error?: string };
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
      } : item;
      setRecords((current) => current.map(applyConfirmation));
      setSelectedRecord((current) => current ? applyConfirmation(current) : current);
      toast.success("Bakım kaydı teyit edildi.");
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
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">🔍</span>
          <input
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Motor, tür veya teknisyen ara..."
            className="w-full bg-panel2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
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
            className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition"
          >
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
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
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {filteredRecords.map((r) => {
              const photos = r.photos || r.photos_b64 || [];
              const videos = r.videos || [];
              const showMedia = !r.group_id || photos.length > 0 || videos.length > 0;
              // user._id veya user.id kontrolü (MongoDB standartlarına göre _id kullanılır)
              const canEdit = user && (user.role === "yonetici" || (user as any)?._id === r.technician_id || (user as any)?.id === r.technician_id);
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
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-text">
                    <span>{r.type_label} · {r.engine_name}</span>
                    {r.manager_confirmation_status === "confirmed" ? <span className="rounded-full border border-green/30 bg-green/10 px-2 py-0.5 text-[9px] font-bold text-green">✓ Teyitli</span> : r.manager_confirmation_status === "pending" ? <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[9px] font-bold text-amber">Teyit bekliyor</span> : <span className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-[9px] font-bold text-faint">Eski kayıt</span>}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    {new Date(r.created_at).toLocaleDateString("tr-TR")} · {r.hour_at_completion.toLocaleString("tr-TR")} sa · {technicianLabel(r)}
                  </div>
                  {(r.maintenance_start_at || r.maintenance_end_at || r.maintenance_duration_minutes != null) && <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-teal"><span>Başlangıç: {r.maintenance_start_at ? new Date(r.maintenance_start_at).toLocaleString("tr-TR") : "—"}</span><span>Bitiş: {r.maintenance_end_at ? new Date(r.maintenance_end_at).toLocaleString("tr-TR") : "—"}</span><span>Süre: {formatMaintenanceDuration(r.maintenance_duration_minutes)}</span></div>}
                  {r.pressure_reading != null && <div className="text-[11.5px] text-muted mt-1">📈 Fark Basıncı: {r.pressure_reading} bar</div>}
                  {r.technician_note && <div className="text-[11.5px] text-muted mt-1">🗒️ {r.technician_note}</div>}
                  {r.other_technicians?.length ? <div className="mt-1 text-[11px] text-muted">👥 Ekip: {r.other_technicians.map((technician) => technician.full_name).join(", ")}</div> : null}

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => void openDetails(r)}
                      className="text-[11px] font-bold text-amber border border-amber/40 rounded-lg px-2.5 py-1.5 hover:bg-amber/10 transition"
                    >
                      🔎 Detay
                    </button>
                    {user?.role === "yonetici" && r.manager_confirmation_status === "pending" && <button
                      type="button"
                      onClick={() => void confirmRecord(r)}
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

      {/* Bakım Kaydı Detay Modalı */}
      {selectedRecord && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4" role="dialog" aria-modal="true" aria-label="Bakım kaydı detayı">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl md:rounded-2xl border border-border bg-panel p-4 shadow-2xl animate-fade-in">
            <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="text-base font-extrabold text-text">{selectedRecord.type_label}</div>
                <div className="mt-0.5 text-[11px] text-muted">{selectedRecord.engine_name} · {new Date(selectedRecord.created_at).toLocaleDateString("tr-TR")}</div>
              </div>
              <button type="button" onClick={() => setSelectedRecord(null)} className="h-8 w-8 rounded-full border border-border bg-panel2 text-text hover:bg-red hover:text-white" aria-label="Detayı kapat">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Motor saati</div><div className="mt-0.5 font-mono font-bold text-amber">{selectedRecord.hour_at_completion.toLocaleString("tr-TR")} sa</div></div>
              <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Sorumlu teknisyen</div><div className="mt-0.5 font-semibold text-text">{technicianLabel(selectedRecord)}</div></div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 text-[11px]">
              <div className="rounded-lg border border-teal/30 bg-teal/10 p-2"><div className="text-faint">Başlangıç</div><div className="mt-0.5 font-mono text-teal">{selectedRecord.maintenance_start_at ? new Date(selectedRecord.maintenance_start_at).toLocaleString("tr-TR") : "—"}</div></div>
              <div className="rounded-lg border border-teal/30 bg-teal/10 p-2"><div className="text-faint">Bitiş</div><div className="mt-0.5 font-mono text-teal">{selectedRecord.maintenance_end_at ? new Date(selectedRecord.maintenance_end_at).toLocaleString("tr-TR") : "—"}</div></div>
              <div className="rounded-lg border border-amber/30 bg-amber/10 p-2"><div className="text-faint">Toplam bakım süresi</div><div className="mt-0.5 font-bold text-amber">{formatMaintenanceDuration(selectedRecord.maintenance_duration_minutes)}</div></div>
            </div>
            {selectedRecord.other_technicians?.length ? <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal"><b>Bu bakımda çalışan diğer teknisyenler:</b> {selectedRecord.other_technicians.map((technician) => technician.full_name).join(", ")}</div> : null}
            {selectedRecord.manager_confirmation_status === "confirmed" ? <div className="mt-2 rounded-lg border border-green/30 bg-green/10 p-2 text-[11px] text-green"><b>✓ Yönetici teyidi:</b> {selectedRecord.manager_confirmed_by_name || "Yönetici"} · {selectedRecord.manager_confirmed_at ? new Date(selectedRecord.manager_confirmed_at).toLocaleString("tr-TR") : "Tarih bilgisi yok"}</div> : selectedRecord.manager_confirmation_status === "pending" ? <div className="mt-2 rounded-lg border border-amber/40 bg-amber/10 p-2 text-[11px] text-amber"><b>Teyit bekliyor:</b> Bu kayıt yönetici tarafından kontrol edilmelidir. {user?.role === "yonetici" && <button type="button" onClick={() => void confirmRecord(selectedRecord)} disabled={confirmingId === selectedRecord._id} className="mt-2 w-full rounded-lg bg-green px-3 py-2 font-bold text-[#071a12] disabled:opacity-50">{confirmingId === selectedRecord._id ? "Teyit ediliyor..." : "✓ Kontrol ettim, teyit et"}</button>}</div> : <div className="mt-2 rounded-lg border border-border bg-panel2 p-2 text-[11px] text-faint"><b>Eski kayıt:</b> Bu kayıt yönetici teyit akışından önce oluşturulmuş.</div>}
            {selectedRecord.checklist?.length ? <div className="mt-2 rounded-lg border border-green/30 bg-green/10 p-2 text-[11px] text-green"><b>Bakım kanıtı:</b> Kontrol listesi tamamlandı{selectedRecord.completion_confirmed_at ? ` · ${new Date(selectedRecord.completion_confirmed_at).toLocaleString("tr-TR")}` : ""}<div className="mt-1 flex flex-col gap-0.5 text-[10px]">{selectedRecord.checklist.map((item) => <span key={item.label}>✓ {item.label}</span>)}</div></div> : null}
            {selectedRecord.pressure_reading != null && <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal">Fark basıncı: <b>{selectedRecord.pressure_reading} bar</b></div>}
            {selectedRecord.technician_note && <div className="mt-2 rounded-lg border border-border bg-panel2 p-2 text-[11px] leading-relaxed text-muted"><b className="text-text">Not:</b> {selectedRecord.technician_note}</div>}
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
