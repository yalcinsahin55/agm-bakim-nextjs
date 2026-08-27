"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { uploadMaintenanceMedia } from "@/lib/mediaUpload";
import { getPendingOfflineCount, queueRecord, syncOfflineQueue, type QueuedMedia } from "@/lib/offlineQueue";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import Lightbox from "@/components/Lightbox";
import MaintenanceTimeTracking from "@/components/MaintenanceTimeTracking";
import MaintenanceChecklist from "@/components/MaintenanceChecklist";
import MaintenanceDefinitionSection from "@/components/MaintenanceDefinitionSection";
import CompletionQuickBanner from "./_components/CompletionQuickBanner";
import CompletionOfflineStatus from "./_components/CompletionOfflineStatus";
import CompletionTechnicianSection from "./_components/CompletionTechnicianSection";
import CompletionEvidenceSection from "./_components/CompletionEvidenceSection";
import CompletionSubmitBar from "./_components/CompletionSubmitBar";
import { ApiFetchError } from "@/lib/apiCache";
import { getMaintenancePanel, invalidateMaintenancePanel, type PanelEngine } from "@/lib/maintenancePanel";
import { canTechnicianWorkOnType, type TechnicianOption } from "@/lib/technicians";
import type { MaintenanceType, ReportAttachment, VideoRef } from "@/lib/types";
import type { PanelItem } from "@/lib/status";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { calculateMaintenanceDurationFromDates, hoursInputToMinutes, minutesToHoursInput, normalizeTechnicianContributionDuration, TIME_TRACKING_VERSION } from "@/lib/maintenanceTime";
import { compressImage } from "@/lib/imageCompression";

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
  const [reportAttachments, setReportAttachments] = useState<ReportAttachment[]>([]);
  const [reportAttachmentBusy, setReportAttachmentBusy] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState<Record<string, string>>({});
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const offlinePreviewUrlsRef = useRef<Record<string, string>>({});
  const clientRequestIdRef = useRef<string | null>(null);
  
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

  const loadPanel = useCallback(async () => {
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
  }, [router]);

  useEffect(() => {
    void loadPanel();
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
  }, [loadPanel]);

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
  const evidenceReady = techNote.trim().length > 0 || photos.length > 0 || videos.length > 0 || reportAttachments.length > 0;

  async function handlePhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || photoBusy) {
      e.target.value = "";
      return;
    }
    setPhotoBusy(true);
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
              // Aşağıdaki genel hata kullanıcıya gösterilir.
            }
          }
          const message = error instanceof Error ? error.message : "Bilinmeyen hata";
          toast.error(`${f.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setPhotos((prev) => [...prev, ...uploaded]);
      setPhotoBusy(false);
      e.target.value = "";
    }
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
    if (!files.length || videoBusy) {
      e.target.value = "";
      return;
    }

    if (videos.length + files.length > 5) {
      toast.warning("Toplamda en fazla 5 video ekleyebilirsiniz.");
      e.target.value = "";
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
            uploadVideoChunked(f.type ? f : new File([f], f.name, { type: "video/mp4", lastModified: f.lastModified })),
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
          const message = err instanceof Error ? err.message.slice(0, 100) : "bilinmeyen hata";
          toast.error(`${f.name} yüklenemedi: ${message}`);
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

  function handleOfflineReportFile(file: File, attachment: ReportAttachment): void {
    const id = attachment.url.startsWith("offline:") ? attachment.url.slice("offline:".length) : makeOfflineId();
    setOfflineMedia((current) => [...current, { id, kind: "report", name: attachment.filename, type: attachment.mime, blob: file }]);
    createOfflinePreview(id, file);
  }

  function removeReportAttachment(attachment: ReportAttachment): void {
    if (!attachment.url.startsWith("offline:")) return;
    const id = attachment.url.slice("offline:".length);
    setOfflineMedia((current) => current.filter((media) => media.id !== id));
    revokeOfflinePreview(id);
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

  function changeResponsibleTechnician(id: string): void {
    setResponsibleTechnicianId(id);
    setOtherTechnicianIds((current) => current.filter((currentId) => currentId !== id));
  }

  const currentUserId = user?._id || user?.id || "";
  const selectedMaintenanceTypes = useMemo(() => [chosenType, ...extraKeys.map((key) => types.find((item) => item.key === key))]
    .filter((type): type is MaintenanceType => Boolean(type)), [chosenType, extraKeys, types]);
  const responsibleTechnicians = useMemo(
    () => technicians.filter((technician) => selectedMaintenanceTypes.every((type) => canTechnicianWorkOnType(technician, type, "responsible"))),
    [selectedMaintenanceTypes, technicians],
  );
  const effectiveResponsibleTechnicianId = responsibleTechnicianId || currentUserId;
  const selectableTechnicians = useMemo(
    () => technicians.filter((technician) => technician.id !== effectiveResponsibleTechnicianId && selectedMaintenanceTypes.every((type) => canTechnicianWorkOnType(technician, type, "support"))),
    [effectiveResponsibleTechnicianId, selectedMaintenanceTypes, technicians],
  );

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
  }, [responsibleTechnicianId, responsibleTechnicians, selectableTechnicians]);

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
    const clientRequestId = clientRequestIdRef.current || makeOfflineId();
    clientRequestIdRef.current = clientRequestId;
    
    const startDate = new Date(maintenanceStartAt);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const isBackdated = Number.isFinite(startDate.getTime()) && startDate.getTime() < todayStart.getTime();

    const extra_types = extraKeys.flatMap((k) => {
      const t = types.find((tt) => tt.key === k);
      if (!t) return [];
      const trackedForEngine = trackedKeys.has(k);
      return [{
        type_key: k, type_label: t.label,
        period: trackedForEngine ? undefined : Number(extraPeriods[k]),
      }];
    });

    const loadingToast = toast.loading("Bakım kaydı işleniyor...");
    const payload = {
      client_request_id: clientRequestId,
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
      report_attachments: reportAttachments,
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
        toast.success(navigator.onLine ? "Kayıt ve rapor ekleri senkronizasyon kuyruğuna alındı; gönderiliyor." : "İnternet yok. Kayıt ve rapor ekleri güvenle kuyruğa alındı.");
        clientRequestIdRef.current = null;
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
        clientRequestIdRef.current = null;
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
    <div className="min-h-screen pb-20">
      <TopBar
        title={quickMode ? "Hızlı Bakım" : "Bakım Tamamla"}
        subtitle={engineId ? `${engines.find((e) => e._id === engineId)?.name || ""} için yeni kayıt` : ""}
      />
      <main className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Kayıt çalışma alanı</div>
            <h1 className="text-xl font-extrabold tracking-tight text-text md:text-2xl">Bakım kaydını tamamla</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Motor, bakım zamanı, ekip katkısı ve kanıtları tek ekranda kontrol ederek kaydı güvenle tamamlayın.</p>
          </div>
          <div className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-bold ${isOnline ? "border-green/30 bg-green/10 text-green" : "border-amber/40 bg-amber/10 text-amber"}`}>
            {isOnline ? "ÇEVRİMİÇİ" : "ÇEVRİMDIŞI ÇALIŞMA"}
          </div>
        </div>

        {quickMode && <CompletionQuickBanner
          isOnline={isOnline}
          engineName={engineId ? engines.find((engine) => engine._id === engineId)?.name || "Motor yükleniyor..." : ""}
          typeName={typeKey ? types.find((type) => type.key === typeKey)?.label || "Bakım türü yükleniyor..." : ""}
          qrEngineId={qrEngineId}
          qrTypeKey={qrTypeKey}
          onExitQuickMode={() => router.replace("/tamamla")}
        />}
        <CompletionOfflineStatus
          isOnline={isOnline}
          pendingOfflineCount={pendingOfflineCount}
          hasOfflineMedia={offlineMedia.length > 0}
          onSyncNow={() => { window.dispatchEvent(new Event("offline-queue:sync")); }}
        />

        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            <MaintenanceDefinitionSection
              engineList={engineList}
              items={engItems}
              allTypesSorted={allTypesSorted}
              engineId={engineId}
              typeKey={typeKey}
              primaryPeriod={primaryPeriod}
              hours={hours}
              quickMode={quickMode}
              qrEngineId={qrEngineId}
              qrTypeKey={qrTypeKey}
              chosenItem={chosenItem}
              chosenType={chosenType}
              onEngineChange={setEngineId}
              onTypeChange={setTypeKey}
              onPrimaryPeriodChange={setPrimaryPeriod}
              onHoursChange={setHours}
            />

            <MaintenanceTimeTracking
              maintenanceStartAt={maintenanceStartAt}
              maintenanceEndAt={maintenanceEndAt}
              timeTrackingReady={timeTrackingReady}
              maintenanceDurationMinutes={maintenanceDurationMinutes}
              showPressure={typeKey === "krank" || typeKey === "intercooler"}
              pressure={pressure}
              onStartChange={setMaintenanceStartAt}
              onEndChange={setMaintenanceEndAt}
              onPressureChange={setPressure}
            />
          </div>

          <CompletionTechnicianSection
            isManager={user?.role === "yonetici"}
            technicianSource={technicianSource}
            externalServiceName={externalServiceName}
            responsibleTechnicianId={responsibleTechnicianId}
            responsibleTechnicianDuration={responsibleTechnicianDuration}
            responsibleTechnicians={responsibleTechnicians}
            selectableTechnicians={selectableTechnicians}
            otherTechnicianIds={otherTechnicianIds}
            otherTechnicianDurations={otherTechnicianDurations}
            maintenanceDurationMinutes={maintenanceDurationMinutes}
            onTechnicianSourceChange={changeTechnicianSource}
            onExternalServiceNameChange={setExternalServiceName}
            onResponsibleTechnicianChange={changeResponsibleTechnician}
            onResponsibleTechnicianDurationChange={setResponsibleTechnicianDuration}
            onOtherTechnicianToggle={toggleOtherTechnician}
            onOtherTechnicianDurationChange={(id, value) => setOtherTechnicianDurations((current) => ({ ...current, [id]: value }))}
          />

          {otherTypes.length > 0 && <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="additional-maintenance-heading"><div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">04 · Birlikte tamamlanan bakımlar</div><h2 id="additional-maintenance-heading" className="mt-1 text-base font-extrabold text-text">Aynı işlemde tamamlanan diğer bakım türleri</h2><p className="mt-1 text-[10px] leading-4 text-faint">İşaretlenen bakım türleri aynı saat ve tarihle kaydedilir. Motor için tanımlı olmayan bakımda periyodu ayrıca girebilirsiniz.</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{otherTypes.map((type) => { const tracked = trackedKeys.has(type.key); const checked = extraKeys.includes(type.key); return <div key={type.key} className="rounded-lg border border-border bg-panel2 px-3 py-2.5"><label className="flex items-center gap-2 text-[11px] text-text"><input type="checkbox" checked={checked} onChange={(event) => toggleExtra(type.key, event.target.checked)} />{type.label}{!tracked && <span className="text-[9.5px] text-faint">· tanımlı değil</span>}</label>{checked && !tracked && <label className="mt-2 block pl-6 text-[9.5px] font-bold uppercase tracking-wide text-muted">Periyodik bakım saati<input type="number" value={extraPeriods[type.key] ?? ""} onChange={(event) => setExtraPeriods((current) => ({ ...current, [type.key]: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-border bg-panel px-2 py-1.5 text-[11px] font-mono text-text" /></label>}</div>; })}</div></section>}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">

            <MaintenanceChecklist
              items={checklistItems}
              values={checklist}
              complete={checklistComplete}
              onItemChange={(item, checked) => setChecklist((current) => ({ ...current, [item]: checked }))}
            />
            <CompletionEvidenceSection
              techNote={techNote}
              setTechNote={setTechNote}
              photos={photos}
              videos={videos}
              reportAttachments={reportAttachments}
              offlinePreviews={offlinePreviews}
              photoBusy={photoBusy}
              videoBusy={videoBusy}
              submitting={submitting}
              evidenceReady={evidenceReady}
              setReportAttachments={setReportAttachments}
              setReportAttachmentBusy={setReportAttachmentBusy}
              onPhotosChange={handlePhotos}
              onVideosChange={handleVideos}
              onOfflineReportFile={handleOfflineReportFile}
              onRemoveReportAttachment={removeReportAttachment}
              onPhotoClick={setSelectedPhoto}
              onRemovePhoto={removePhoto}
              onRemoveVideo={removeVideo}
            />
          </div>

          <CompletionSubmitBar
            submitting={submitting}
            photoBusy={photoBusy}
            videoBusy={videoBusy}
            reportAttachmentBusy={reportAttachmentBusy}
            hasChosenType={Boolean(chosenType)}
            checklistComplete={checklistComplete}
            timeTrackingReady={timeTrackingReady}
            evidenceReady={evidenceReady}
            onCancel={() => router.back()}
          />
        </form>
      </main>

      <Lightbox src={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      <BottomNav />
    </div>
  );
}
