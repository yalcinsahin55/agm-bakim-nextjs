"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { getPendingOfflineCount, queueRecord, syncOfflineQueue, type QueuedMedia } from "@/lib/offlineQueue";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import Lightbox from "@/components/Lightbox";
import { STATUS_LABELS } from "@/lib/status";
import { ApiFetchError } from "@/lib/apiCache";
import { getMaintenancePanel, invalidateMaintenancePanel, type PanelEngine } from "@/lib/maintenancePanel";
import { canTechnicianWorkOnType, EXTERNAL_SERVICE_TECHNICIAN_NAME, TECHNICIAN_TYPE_LABELS, type TechnicianOption } from "@/lib/technicians";
import type { MaintenanceType, VideoRef } from "@/lib/types";
import type { PanelItem } from "@/lib/status";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { calculateMaintenanceDurationFromDates, formatMaintenanceDuration, hoursInputToMinutes, minutesToHoursInput, normalizeTechnicianContributionDuration, TIME_TRACKING_VERSION } from "@/lib/maintenanceTime";

const CHECKLIST_TEMPLATES = {
  yag: ["Yağ seviyesi ve kaçak kontrolü", "Filtre ve bağlantı kontrolü", "Çalışma sonrası tekrar kontrol"],
  krank: ["Fark basıncı ölçümü", "Filtre yüzeyi kontrolü", "Bağlantı ve kaçak kontrolü"],
  intercooler: ["Fark basıncı ölçümü", "Hortum ve kelepçe kontrolü", "Soğutucu yüzey kontrolü"],
  alternator: ["Kablo ve bağlantı kontrolü", "Görsel hasar kontrolü", "Çalışma testi"],
  default: ["Görsel genel kontrol", "Bakım işlemi tamamlandı", "Çalışma sonrası kontrol"],
};

function checklistForType(typeKey: string, label?: string): string[] {
  const normalized = `${typeKey} ${label || ""}`.toLocaleLowerCase("tr");
  if (normalized.includes("yağ")) return CHECKLIST_TEMPLATES.yag;
  if (normalized.includes("krank")) return CHECKLIST_TEMPLATES.krank;
  if (normalized.includes("intercooler")) return CHECKLIST_TEMPLATES.intercooler;
  if (normalized.includes("alternat")) return CHECKLIST_TEMPLATES.alternator;
  return CHECKLIST_TEMPLATES.default;
}

function compressImage(file: File, maxDim = 720, quality = 0.65): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
          reader.onload = (e) => {

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
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

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

export default function TamamlaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const quickMode = searchParams.get("mode") === "quick";
  const qrEngineId = searchParams.get("engine_id");
  const qrTypeKey = searchParams.get("type_key");
  const [items, setItems] = useState<PanelItem[]>([]);
  const [engines, setEngines] = useState<PanelEngine[]>([]);
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);

  const [engineId, setEngineId] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [primaryPeriod, setPrimaryPeriod] = useState(1000);
  const [hours, setHours] = useState(0);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState("");
  const [maintenanceEndAt, setMaintenanceEndAt] = useState("");
  const [pressure, setPressure] = useState("");
  const [techNote, setTechNote] = useState("");
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [extraPeriods, setExtraPeriods] = useState<Record<string, number>>({});
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState("");
  const [responsibleTechnicianDuration, setResponsibleTechnicianDuration] = useState<string | number>("");
  const [otherTechnicianIds, setOtherTechnicianIds] = useState<string[]>([]);
  const [otherTechnicianDurations, setOtherTechnicianDurations] = useState<Record<string, string | number>>({});
  const [technicianSource, setTechnicianSource] = useState<"internal" | "external_service">("internal");
  const [externalServiceName, setExternalServiceName] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [videos, setVideos] = useState<VideoRef[]>([]);
  const [videoBusy, setVideoBusy] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState<Record<string, string>>({});
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const offlinePreviewUrlsRef = useRef<Record<string, string>>({});
  
  const [submitting, setSubmitting] = useState(false);

  function createOfflinePreview(id: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    offlinePreviewUrlsRef.current[id] = url;
    setOfflinePreviews((current) => ({ ...current, [id]: url }));
    return url;
  }

  function revokeOfflinePreview(id: string): void {
    const url = offlinePreviewUrlsRef.current[id];
    if (url) URL.revokeObjectURL(url);
    delete offlinePreviewUrlsRef.current[id];
    setOfflinePreviews((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  useEffect(() => () => {
    Object.values(offlinePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    offlinePreviewUrlsRef.current = {};
  }, []);

  async function loadPanel() {
    try {
      const data = await getMaintenancePanel();
      setItems(data.items);
      setEngines(data.engines);
      setTypes(data.types);
      setLoading(false);
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) {
        const redirect = `${window.location.pathname}${window.location.search}`;
        router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      setLoading(false);
      toast.error("Bakım paneli yüklenemedi.");
    }
  }

  useEffect(() => {
    loadPanel();
    fetch("/api/users/technicians")
      .then(async (response) => { if (response.ok) setTechnicians(await response.json()); })
      .catch(() => {});
    setIsOnline(navigator.onLine);
    const updateConnection = () => setIsOnline(navigator.onLine);
    const updateQueue = (event?: Event) => {
      const remaining = (event as CustomEvent<{ remaining?: number }> | undefined)?.detail?.remaining;
      if (typeof remaining === "number") {
        setPendingOfflineCount(remaining);
        return;
      }
      void getPendingOfflineCount().then(setPendingOfflineCount).catch(() => {});
    };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("offline-queue:changed", updateQueue);
    updateQueue();
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("offline-queue:changed", updateQueue);
    };
  }, []);

  const engineList = useMemo(
    () => [...engines].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true })),
    [engines]
  );
  const allTypesSorted = useMemo(() => [...types].sort((a, b) => a.label.localeCompare(b.label, "tr")), [types]);

  useEffect(() => {
    if (!engineList.length) return;
    if (quickMode && qrEngineId) {
      const matched = engineList.find((engine) => engine._id === qrEngineId || engine.name === qrEngineId);
      if (matched) {
        setEngineId(matched._id);
        return;
      }
      toast.error("QR kodundaki motor bulunamadı.");
      router.replace("/tamamla");
      return;
    }
    if (!engineId) setEngineId(engineList[0]._id);
  }, [engineList, engineId, quickMode, qrEngineId, router]);

  useEffect(() => {
    if (!qrTypeKey || !allTypesSorted.length) return;
    const matched = allTypesSorted.find((type) => type.key === qrTypeKey || type._id === qrTypeKey);
    if (matched) {
      setTypeKey(matched.key);
    } else {
      toast.error("QR kodundaki bakım türü bulunamadı.");
      router.replace("/tamamla");
    }
  }, [allTypesSorted, qrTypeKey, router]);

  useEffect(() => {
    if (!engineId) return;
    const eng = engines.find((e) => e._id === engineId);
    if (eng) setHours(eng.hours);
  }, [engineId, engines]);

  const engItems = useMemo(
    () => items.filter((i) => i.engine_id === engineId).sort((a, b) => a.remaining - b.remaining),
    [items, engineId]
  );
  const trackedKeys = useMemo(() => new Set(engItems.map((i) => i.type_key)), [engItems]);

  useEffect(() => {
    if (allTypesSorted.length && !allTypesSorted.find((t) => t.key === typeKey)) {
      setTypeKey(allTypesSorted[0].key);
    }
  }, [allTypesSorted, typeKey]);

  const chosenItem = engItems.find((i) => i.type_key === typeKey);
  const chosenType = types.find((t) => t.key === typeKey);
  const checklistItems = useMemo(() => checklistForType(typeKey, chosenType?.label), [typeKey, chosenType]);
  const isPrimaryNew = !!chosenType && !trackedKeys.has(typeKey);

  useEffect(() => {
    if (isPrimaryNew && chosenType) setPrimaryPeriod(chosenType.default_period_hours);
    setChecklist(Object.fromEntries(checklistItems.map((item) => [item, false])));
  }, [isPrimaryNew, chosenType, checklistItems]);

  const otherTypes = allTypesSorted.filter((t) => t.key !== typeKey);
  const checklistComplete = checklistItems.length > 0 && checklistItems.every((item) => checklist[item] === true);
  const maintenanceDurationMinutes = calculateMaintenanceDurationFromDates(maintenanceStartAt, maintenanceEndAt);
  const timeTrackingReady = maintenanceDurationMinutes !== null;
  const isManagerInternalRecord = user?.role === "yonetici" && technicianSource !== "external_service";
  const responsibleDurationMinutes = isManagerInternalRecord ? hoursInputToMinutes(responsibleTechnicianDuration) : null;
  const evidenceReady = techNote.trim().length > 0 || photos.length > 0 || videos.length > 0;

  async function handlePhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoBusy(true);
    const uploaded = [];
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
          "Fotoğraf yükleme zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
        );
        const result = await response.json();
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
            // Aşağıdaki genel hata kullanıcıya gösterilir.
          }
        }
        const message = error instanceof Error ? error.message : "Bilinmeyen hata";
        toast.error(`${f.name} yüklenemedi: ${message}`);
      }
    }
    setPhotos((prev) => [...prev, ...uploaded]);
    setPhotoBusy(false);
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    const photo = photos[idx];
    if (photo && photo.startsWith("offline:")) {
      const id = photo.slice("offline:".length);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
      revokeOfflinePreview(id);
    }
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  // Videolar küçük parçalara bölünerek uygulama API’sine gönderilir ve Blob’a yazılır.
  async function handleVideos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (videos.length + files.length > 5) {
      toast.warning("Toplamda en fazla 5 video ekleyebilirsiniz.");
      return;
    }

    setVideoBusy(true);
    try {
      for (const f of files) {
        if (f.size > 100 * 1024 * 1024) {
          toast.error(`${f.name} çok büyük (en fazla 100MB).`);
          continue;
        }
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
          createOfflinePreview(id, f);
          setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name }]);
          continue;
        }
        try {
          const url = await withTimeout(
            uploadVideoChunked(f),
            600_000,
            "Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.",
          );
          setVideos((current) => [...current, { url, filename: f.name }]);
        } catch (err) {
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
            createOfflinePreview(id, f);
            setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name }]);
            continue;
          }
          console.error("Video yükleme hatası:", err);
          toast.error(`${f.name} yüklenemedi: ${err && err.message ? err.message.slice(0, 100) : "bilinmeyen hata"}`);
        }
      }
    } finally {
      setVideoBusy(false);
      e.target.value = "";
    }
  }

  function removeVideo(idx: number) {
    const video = videos[idx];
    if (video?.url?.startsWith("offline:")) {
      const id = video.url.slice("offline:".length);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
      revokeOfflinePreview(id);
    }
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleExtra(key: string, checked: boolean) {
    setExtraKeys((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
    if (checked && extraPeriods[key] === undefined) {
      const t = types.find((tt) => tt.key === key);
      setExtraPeriods((prev) => ({ ...prev, [key]: t ? t.default_period_hours : 1000 }));
    }
  }

  function toggleOtherTechnician(id: string, checked: boolean) {
    setOtherTechnicianIds((current) => checked ? [...new Set([...current, id])] : current.filter((currentId) => currentId !== id));
    setOtherTechnicianDurations((current) => {
      const next = { ...current };
      if (checked && next[id] === undefined) next[id] = normalizeTechnicianContributionDuration(undefined, maintenanceDurationMinutes ?? 60);
      else delete next[id];
      return next;
    });
  }

  function changeTechnicianSource(source: "internal" | "external_service") {
    setTechnicianSource(source);
    if (source === "external_service") setOtherTechnicianIds([]);
  }

  function changeResponsibleTechnician(id) {
    setResponsibleTechnicianId(id);
    setOtherTechnicianIds((current) => current.filter((currentId) => currentId !== id));
  }

  const currentUserId = user?._id || user?.id || "";
  const selectedMaintenanceTypes = [chosenType, ...extraKeys.map((key) => types.find((item) => item.key === key))].filter(Boolean);
  const isEligibleForRole = (technician, role) => selectedMaintenanceTypes.every((type) => canTechnicianWorkOnType(technician, type, role));
  const responsibleTechnicians = technicians.filter((technician) => isEligibleForRole(technician, "responsible"));
  const effectiveResponsibleTechnicianId = responsibleTechnicianId || currentUserId;
  const selectableTechnicians = technicians.filter((technician) => technician.id !== effectiveResponsibleTechnicianId && isEligibleForRole(technician, "support"));

  useEffect(() => {
    if (isManagerInternalRecord && maintenanceDurationMinutes !== null && responsibleTechnicianDuration === "") {
      setResponsibleTechnicianDuration(minutesToHoursInput(maintenanceDurationMinutes));
    }
  }, [isManagerInternalRecord, maintenanceDurationMinutes, responsibleTechnicianDuration]);

  useEffect(() => {
    setOtherTechnicianIds((current) => {
      const next = current.filter((id) => selectableTechnicians.some((technician) => technician.id === id));
      return next.length === current.length ? current : next;
    });
    if (responsibleTechnicianId && !responsibleTechnicians.some((technician) => technician.id === responsibleTechnicianId)) {
      setResponsibleTechnicianId("");
    }
  }, [typeKey, extraKeys.join("|"), technicians.length, responsibleTechnicianId]);

  async function submit() {
    if (!chosenType) {
      toast.error("Lütfen bir bakım türü seçin.");
      return;
    }
    if (!checklistComplete) {
      toast.error("Bakımı tamamlamadan önce kontrol listesindeki tüm maddeleri işaretleyin.");
      return;
    }
    if (!timeTrackingReady) {
      toast.error("Bakım başlangıç ve bitiş tarih-saatlerini geçerli şekilde girin.");
      return;
    }
    if (!evidenceReady) {
      toast.error("Bakım kanıtı için en az bir not, fotoğraf veya video ekleyin.");
      return;
    }
    if (isManagerInternalRecord && (!responsibleDurationMinutes || responsibleDurationMinutes <= 0)) {
      toast.error("Sorumlu teknisyen için 0’dan büyük çalışma süresini saat olarak girin.");
      return;
    }
    if (isManagerInternalRecord && maintenanceDurationMinutes !== null && responsibleDurationMinutes !== null && responsibleDurationMinutes > maintenanceDurationMinutes) {
      toast.error("Sorumlu teknisyen süresi toplam bakım süresini aşamaz.");
      return;
    }
    const selectedSupportIds = otherTechnicianIds.filter((id) => selectableTechnicians.some((technician) => technician.id === id));
    const selectedSupportDurations = selectedSupportIds.map((id) => normalizeTechnicianContributionDuration(otherTechnicianDurations[id], maintenanceDurationMinutes ?? 0));
    if (isManagerInternalRecord && selectedSupportDurations.some((duration) => duration <= 0)) {
      toast.error("Seçilen her destek teknisyeni için 0’dan büyük çalışma süresini saat olarak girin.");
      return;
    }
    if (isManagerInternalRecord && maintenanceDurationMinutes !== null && selectedSupportDurations.some((duration) => duration > maintenanceDurationMinutes)) {
      toast.error("Destek teknisyeni süresi toplam bakım süresini aşamaz.");
      return;
    }
    
    setSubmitting(true);
    
    const startDate = new Date(maintenanceStartAt);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const isBackdated = Number.isFinite(startDate.getTime()) && startDate.getTime() < todayStart.getTime();

    const extra_types = extraKeys.map((k) => {
      const t = types.find((tt) => tt.key === k);
      const trackedForEngine = trackedKeys.has(k);
      return {
        type_key: k, type_label: t.label,
        period: trackedForEngine ? undefined : Number(extraPeriods[k]),
      };
    });

    const loadingToast = toast.loading("Bakım kaydı işleniyor...");
    const payload = {
      engine_id: engineId, type_key: chosenType.key, type_label: chosenType.label,
      technician_source: technicianSource,
      ...(isManagerInternalRecord && responsibleTechnicianId ? { responsible_technician_id: responsibleTechnicianId } : {}),
      ...(isManagerInternalRecord && responsibleDurationMinutes !== null ? { responsible_technician_duration: responsibleDurationMinutes } : {}),
      external_service_name: technicianSource === "external_service" ? externalServiceName.trim() || undefined : undefined,
      hour_at_completion: Number(hours), technician_note: techNote,
      time_tracking_version: TIME_TRACKING_VERSION,
      maintenance_start_at: new Date(maintenanceStartAt).toISOString(),
      maintenance_end_at: new Date(maintenanceEndAt).toISOString(),
      photos,
      videos,
      pressure_reading: pressure !== "" ? Number(pressure) : undefined,
      backdated: isBackdated,
      period: isPrimaryNew ? Number(primaryPeriod) : undefined, extra_types,
      other_technician_ids: otherTechnicianIds.filter((id) => selectableTechnicians.some((technician) => technician.id === id)),
      other_technician_durations: Object.fromEntries(otherTechnicianIds.filter((id) => selectableTechnicians.some((technician) => technician.id === id)).map((id) => [id, normalizeTechnicianContributionDuration(otherTechnicianDurations[id], maintenanceDurationMinutes ?? 60)])
),
      checklist: checklistItems.map((label) => ({ label, completed: checklist[label] === true })),
      completion_confirmation: true,
    };

    try {
      if (!navigator.onLine || offlineMedia.length > 0) {
        await queueRecord(payload, offlineMedia);
        toast.dismiss(loadingToast);
        toast.success(navigator.onLine ? "Kayıt senkronizasyon kuyruğuna alındı; gönderiliyor." : "İnternet yok. Kayıt güvenle kuyruğa alındı.");
        if (navigator.onLine) void syncOfflineQueue();
        router.push("/dashboard");
        return;
      }

      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(user?.role === "yonetici" || data.confirmed ? `${data.completed.join(", ")} bakımı kaydedildi ve teyit edildi.` : `${data.completed.join(", ")} bakımı kaydedildi. Yönetici teyidi bekleniyor.`);
        invalidateMaintenancePanel();
        window.dispatchEvent(new Event("notifications:refresh"));
        router.push("/dashboard");
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kayıt sırasında bir hata oluştu.");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Sunucu bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Tamamla" subtitle="Veriler yükleniyor..." />
        <div className="px-4 py-4 flex flex-col gap-1">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-16 w-full rounded-xl mb-2" />
          <Skeleton className="h-4 w-40 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-1" />
          <Skeleton className="h-3 w-3/4 mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-16 w-full rounded-xl mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-14 w-full rounded-xl mt-2" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title={quickMode ? "Hızlı Bakım" : "Bakım Tamamla"}
        subtitle={engineId ? `${engines.find((e) => e._id === engineId)?.name || ""} için yeni kayıt` : ""}
      />
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex min-w-0 flex-col gap-1">
        {quickMode && (
          <div className="mb-2 rounded-xl border border-teal/40 bg-teal/10 px-3 py-2.5 text-[11px] text-teal" role="status">
            <div className="font-bold">QR ile Hızlı Bakım Modu</div>
            <div className="mt-0.5 text-[10px] text-muted">{qrEngineId && qrTypeKey ? "Motor ve bakım türü QR koddan seçildi ve kilitlendi." : qrEngineId ? "Motor QR koddan seçildi ve kilitlendi." : qrTypeKey ? "Bakım türü QR koddan seçildi ve kilitlendi; şimdi motoru seç." : "QR ile hızlı bakım başlatıldı."}</div>
          </div>
        )}
        {(!isOnline || pendingOfflineCount > 0 || offlineMedia.length > 0) && (
          <div className="mb-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-[11px] text-amber" role="status">
            <div className="font-bold">{!isOnline ? "Çevrimdışı çalışma açık." : "Senkronizasyon bekleyen kayıt var."}</div>
            <div className="mt-0.5 text-[10px] text-muted">
              {!isOnline ? "Kayıt ve seçtiğiniz medya cihazda tutulur; bağlantı gelince gönderilir." : `${pendingOfflineCount} kayıt bağlantı üzerinden gönderilmeyi bekliyor.`}
            </div>
            {isOnline && pendingOfflineCount > 0 && <button type="button" onClick={() => { window.dispatchEvent(new Event("offline-queue:sync")); }} className="mt-2 rounded-lg border border-amber/40 px-2.5 py-1.5 text-[10px] font-bold text-amber">Şimdi senkronize et</button>}
          </div>
        )}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Motor</label>
        <select
          value={engineId}
          onChange={(e) => setEngineId(e.target.value)}
          disabled={Boolean(quickMode && qrEngineId)}
          className={`bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 ${quickMode && qrEngineId ? "cursor-not-allowed opacity-80" : ""}`}
          aria-label={quickMode && qrEngineId ? "QR ile seçilen motor" : "Motor seçimi"}
        >
          {engineList.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Bakım Türü</label>
                <select
          value={typeKey} onChange={(e) => setTypeKey(e.target.value)} disabled={Boolean(quickMode && qrTypeKey)} className={`bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 ${quickMode && qrTypeKey ? "cursor-not-allowed opacity-80" : ""}`}>
          {allTypesSorted.map((t) => {
            const it = engItems.find((i) => i.type_key === t.key);
            const label = it
              ? `${t.label} · ${STATUS_LABELS[it.status]} · ${Math.round(it.remaining)} sa`
              : `${t.label} · ⚪ Bu motor için tanımlı değil`;
            return <option key={t.key} value={t.key}>{label}</option>;
          })}
        </select>

        {chosenItem ? (
          <div className="bg-teal/10 border border-teal/30 rounded-xl px-3.5 py-3 mb-2 text-[11.5px] text-muted">
            Motor saati: {chosenItem.engine_hours.toLocaleString("tr-TR")} · Son bakım: {chosenItem.last_hour.toLocaleString("tr-TR")} · Periyot: {chosenItem.period.toLocaleString("tr-TR")} sa
          </div>
        ) : chosenType ? (
          <div className="bg-amber/10 border border-amber/30 rounded-xl px-3.5 py-3 mb-2">
            <div className="text-[11.5px] text-muted mb-2">
              <b className="text-amber">{chosenType.label}</b>, bu motor için tanımlı değildi. Bu kaydı eklersen yeni bir bakım takibi başlatılır.
            </div>
            <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide">Periyodik bakım saati</label>
            <input
              type="number" value={primaryPeriod} onChange={(e) => setPrimaryPeriod(Number(e.target.value) || 0)}
              className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono mt-1"
            />
          </div>
        ) : null}

          </div>
          <div className="flex min-w-0 flex-col gap-1">
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">O Anki Motor Çalışma Saati</label>
        <input
          type="number" value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-amber mb-1"
        />
        <p className="text-[11px] text-faint mb-2 leading-relaxed">
          Bu değer motorun güncel saatinden büyükse motorun güncel saatini de günceller; küçük veya eşitse yalnızca bu bakım kaydına yazılır.
        </p>

        <div className="mb-2 rounded-xl border border-amber/30 bg-amber/5 p-3">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Bakım Başlangıç ve Bitiş Zamanı</div>
          <div className="mt-0.5 text-[10.5px] text-faint">Bakım birden fazla gün sürebilir; gerçek başlangıç ve bitiş tarih-saatini seçin.</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-[10.5px] font-bold text-muted">Başlangıç
              <input required type="datetime-local" value={maintenanceStartAt} max={maintenanceEndAt || undefined} onChange={(event) => setMaintenanceStartAt(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono outline-none focus:border-amber" />
            </label>
            <label className="text-[10.5px] font-bold text-muted">Bitiş
              <input required type="datetime-local" value={maintenanceEndAt} min={maintenanceStartAt || undefined} onChange={(event) => setMaintenanceEndAt(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono outline-none focus:border-amber" />
            </label>
          </div>
          <div className={`mt-2 rounded-lg px-2.5 py-2 text-[10.5px] ${timeTrackingReady ? "bg-green/10 text-green" : "bg-red/10 text-red"}`} role="status">{timeTrackingReady ? `Toplam bakım süresi: ${formatMaintenanceDuration(maintenanceDurationMinutes)}` : "Geçerli bir başlangıç ve bitiş zamanı girin."}</div>
        </div>

        {(typeKey === "krank" || typeKey === "intercooler") && (
          <>
            <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Fark Basıncı (bar)</label>
            <input
              type="number" step="0.1" value={pressure} onChange={(e) => setPressure(e.target.value)}
              className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-teal mb-2"
            />
          </>
        )}

        {user?.role === "yonetici" && <div className="mb-2 rounded-xl border border-purple-400/30 bg-purple-400/5 p-3">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Sorumlu kaynağı</div>
          <div className="mt-0.5 text-[10.5px] text-faint">Dış servis veya garanti kapsamındaki bakımlarda kayıtlı teknisyen seçmeden kayıt oluşturabilirsin.</div>
          <select value={technicianSource} onChange={(event) => changeTechnicianSource(event.target.value as "internal" | "external_service")} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-purple-400">
            <option value="internal">Kayıtlı teknisyenler / benim hesabım</option>
            <option value="external_service">{EXTERNAL_SERVICE_TECHNICIAN_NAME}</option>
          </select>
          {technicianSource === "external_service" && <>
            <input value={externalServiceName} onChange={(event) => setExternalServiceName(event.target.value)} placeholder="Servis veya firma adı (isteğe bağlı)" maxLength={160} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-purple-400" />
            <div className="mt-2 rounded-lg bg-purple-400/10 px-2.5 py-2 text-[10.5px] text-purple-200">Bu kayıt sorumlu teknisyen performansına dahil edilmez; bakım geçmişinde dış hizmet olarak görünür ve yalnızca yönetici tarafından girilebilir.</div>
          </>}
          {technicianSource !== "external_service" && user?.role === "yonetici" && <div className="mt-3 rounded-lg border border-purple-400/25 bg-purple-400/5 p-2.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted" htmlFor="responsible-technician">Yetkili / sorumlu bakımcı</label>
            <div className="mt-0.5 text-[10px] text-faint">Bu kayıt kimin sorumluluğunda tamamlandıysa onu seç. Elektromekanik ekip üyeleri genellikle destek rolünde takip edilir. Bu seçim yalnızca yöneticiye açıktır.</div>
            <select id="responsible-technician" value={responsibleTechnicianId} onChange={(event) => changeResponsibleTechnician(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-purple-400">
              <option value="">Varsayılan: benim hesabım</option>
              {responsibleTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.full_name} · {TECHNICIAN_TYPE_LABELS[technician.technician_type] || "Mekanik teknisyen"}</option>)}
            </select>
            <label className="mt-2 block text-[10.5px] font-bold text-muted" htmlFor="responsible-technician-duration">Sorumlu teknisyen çalışma süresi (saat)
              <input id="responsible-technician-duration" type="number" min="0.25" max="8784" step="0.25" value={responsibleTechnicianDuration === "" ? minutesToHoursInput(maintenanceDurationMinutes ?? 60) : responsibleTechnicianDuration} onChange={(event) => setResponsibleTechnicianDuration(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono outline-none focus:border-purple-400" />
            </label>
            <div className="mt-1 text-[10px] text-faint">Varsayılan değer toplam bakım süresidir; birden fazla gün süren bakımda gerçek kişi süresini girin.</div>
          </div>}
        </div>}

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Bakımcı Notu</label>
        <textarea
          value={techNote} onChange={(e) => setTechNote(e.target.value)} rows={2}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
        />

        {technicianSource !== "external_service" && selectableTechnicians.length > 0 && <div className="mb-2 rounded-xl border border-teal/30 bg-teal/5 p-3">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Bu bakımda çalışan diğer teknisyenler</div>
          <div className="mt-0.5 text-[10.5px] text-faint">Sorumlu teknisyen dışında, bu bakım türünde destek yetkisi bulunan ekip üyelerini seçebilirsin.</div>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {selectableTechnicians.map((technician) => <div key={technician.id} className="rounded-lg bg-panel2 px-2.5 py-2 text-[11.5px] text-text"><label className="flex items-center gap-2"><input type="checkbox" checked={otherTechnicianIds.includes(technician.id)} onChange={(event) => toggleOtherTechnician(technician.id, event.target.checked)} />{technician.full_name} <span className="text-[10px] text-faint">· {TECHNICIAN_TYPE_LABELS[technician.technician_type] || "Mekanik teknisyen"}</span></label>{otherTechnicianIds.includes(technician.id) && <label className="mt-1.5 ml-6 flex items-center gap-1.5 text-[10px] text-faint">Bu bakımda çalışma süresi ({user?.role === "yonetici" ? "saat" : "dk"})<input type="number" min="0" max={user?.role === "yonetici" ? 8784 : 366 * 24 * 60} step={user?.role === "yonetici" ? "0.25" : "15"} value={user?.role === "yonetici" ? minutesToHoursInput(normalizeTechnicianContributionDuration(otherTechnicianDurations[technician.id], maintenanceDurationMinutes ?? 60)) : normalizeTechnicianContributionDuration(otherTechnicianDurations[technician.id], maintenanceDurationMinutes ?? 60)} onChange={(event) => setOtherTechnicianDurations((current) => ({ ...current, [technician.id]: user?.role === "yonetici" ? (hoursInputToMinutes(event.target.value) ?? 0) : event.target.value }))} className="w-20 rounded-md border border-border bg-panel px-1.5 py-1 text-right font-mono text-[11px] text-text" /></label>}</div>)}
          </div>
        </div>}

        <div className="mb-2 rounded-xl border border-border bg-panel p-3">
          <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-muted">Kontrol Listesi</div>
          <div className="mb-2 text-[10.5px] text-faint">Standart maddeleri işaretleyerek bakımın tamamlandığını doğrula.</div>
          <div className="flex flex-col gap-1.5">
            {checklistItems.map((item) => <label key={item} className="flex items-center gap-2 rounded-lg bg-panel2 px-2.5 py-2 text-[11.5px] text-text"><input type="checkbox" checked={checklist[item] === true} onChange={(e) => setChecklist((current) => ({ ...current, [item]: e.target.checked }))} />{item}</label>)}
          </div>
          <div className={`mt-2 rounded-lg p-2 text-[10.5px] ${checklistComplete ? "bg-green/10 text-green" : "bg-amber/10 text-amber"}`} role="status">{checklistComplete ? "✓ Kontrol listesi tamamlandı." : "Kontrol listesindeki tüm maddeleri işaretleyin."}</div>
        </div>

        {otherTypes.length > 0 && (
          <>
            <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide mt-1">Birlikte Tamamlanan Diğer Bakımlar</label>
            <p className="text-[11px] text-faint mb-1.5">
              Bazen bir bakımı yaparken diğerlerini de yapmış oluyorsunuz — motor için daha önce hiç tanımlı olmayan
              bir bakım türü de olsa, işaretleyip periyodunu girerek ekleyebilirsiniz. Hepsi aynı saat/tarihle kaydedilir.
            </p>
            <div className="flex flex-col gap-1.5 mb-2">
              {otherTypes.map((t) => {
                const tracked = trackedKeys.has(t.key);
                const checked = extraKeys.includes(t.key);
                return (
                  <div key={t.key} className="bg-panel border border-border rounded-xl px-3 py-2.5">
                    <label className="flex items-center gap-2 text-[12.5px] text-text">
                      <input type="checkbox" checked={checked} onChange={(e) => toggleExtra(t.key, e.target.checked)} />
                      {t.label}
                      {!tracked && <span className="text-[10px] text-faint">· ⚪ tanımlı değil</span>}
                    </label>
                    {checked && !tracked && (
                      <div className="mt-2 pl-6">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wide">Periyodik bakım saati</label>
                        <input
                          type="number" value={extraPeriods[t.key] ?? ""}
                          onChange={(e) => setExtraPeriods((prev) => ({ ...prev, [t.key]: Number(e.target.value) || 0 }))}
                          className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] font-mono mt-1"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1">
        {/* Fotoğraf Bölümü */}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Fotoğraf</label>
        <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted mb-2 cursor-pointer">
          📷 {photoBusy ? "İşleniyor..." : "Fotoğraf ekle (birden fazla seçebilirsiniz)"}
          <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
        </label>
        {photos.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {photos.map((p, idx) => (
              <div key={idx} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(getPhotoSrc(p, offlinePreviews))}
                  className="block hover:scale-105 transition-transform"
                  aria-label="Fotoğrafı büyüt"
                >
                  <img src={getPhotoSrc(p, offlinePreviews)} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />
                </button>
                <button onClick={() => removePhoto(idx)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-panel2 border border-border text-[10px] leading-none p-0.5">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Video Bölümü — ✨ Blob'a yüklenir */}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Video</label>
        <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted mb-2 cursor-pointer">
          🎥 {videoBusy ? "Yükleniyor..." : "Video ekle (Max 5 adet, her biri max 100MB)"}
          <input type="file" accept="video/*" multiple onChange={handleVideos} className="hidden" />
        </label>
        {videos.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {videos.map((v, idx) => (
              <div key={idx} className="relative">
                <video src={v.url?.startsWith("offline:") ? offlinePreviews[v.url.slice("offline:".length)] : v.url} className="w-20 h-20 rounded-lg object-cover border border-border bg-black" controls={false} />
                <button 
                  onClick={() => removeVideo(idx)} 
                  className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-panel2 border border-border text-[10px] leading-none p-0.5 text-red"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!evidenceReady && <div className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-[10.5px] text-amber" role="status">Bakımı kaydetmek için en az bir bakım notu veya fotoğraf/video kanıtı ekleyin.</div>}
        <button
          onClick={submit} disabled={submitting || videoBusy || !chosenType || !checklistComplete || !timeTrackingReady || !evidenceReady}
          className="mt-3 w-full rounded-xl bg-amber py-3.5 text-[14.5px] font-extrabold text-[#1a1206] shadow-lg disabled:opacity-50"
        >
          {submitting ? "Kaydediliyor..." : "✅ Bakımı Tamamla"}
        </button>
        </div>
      </div>

      <Lightbox src={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      <BottomNav />
    </div>
  );
}
