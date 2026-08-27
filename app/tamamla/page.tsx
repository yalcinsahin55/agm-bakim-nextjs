"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getPendingOfflineCount, queueRecord, syncOfflineQueue } from "@/lib/offlineQueue";
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
import type { MaintenanceType } from "@/lib/types";
import type { PanelItem } from "@/lib/status";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { calculateMaintenanceDurationFromDates, hoursInputToMinutes, minutesToHoursInput, normalizeTechnicianContributionDuration } from "@/lib/maintenanceTime";
import AdditionalMaintenanceTypes from "./_components/AdditionalMaintenanceTypes";
import { useCompletionEvidenceMedia } from "./_hooks/useCompletionEvidenceMedia";
import CompletionWorkspaceHeader from "./_components/CompletionWorkspaceHeader";
import { checklistForType } from "./_lib/checklist";
import { buildCompletionPayload } from "./_lib/completionPayload";
import { getCompletionValidationError } from "./_lib/completionValidation";
import { makeOfflineId } from "./_lib/offlineHelpers";

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

  const { photos, videos, reportAttachments, offlineMedia, offlinePreviews, photoBusy, videoBusy, reportAttachmentBusy, setReportAttachments, setReportAttachmentBusy, handlePhotos, handleVideos, removePhoto, removeVideo, handleOfflineReportFile, removeReportAttachment } = useCompletionEvidenceMedia();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const clientRequestIdRef = useRef<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

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
    const selectedSupportIds = otherTechnicianIds.filter((id) => selectableTechnicians.some((technician) => technician.id === id));
    const selectedSupportDurations = selectedSupportIds.map((id) => normalizeTechnicianContributionDuration(otherTechnicianDurations[id], maintenanceDurationMinutes ?? 0));
    const validationError = getCompletionValidationError({
      chosenTypePresent: Boolean(chosenType),
      checklistComplete,
      timeTrackingReady,
      evidenceReady,
      isManagerInternalRecord,
      responsibleDurationMinutes,
      maintenanceDurationMinutes,
      selectedSupportDurations,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!chosenType) return;
    
    setSubmitting(true);
    const clientRequestId = clientRequestIdRef.current || makeOfflineId();
    clientRequestIdRef.current = clientRequestId;
    
    const startDate = new Date(maintenanceStartAt);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const isBackdated = Number.isFinite(startDate.getTime()) && startDate.getTime() < todayStart.getTime();


    const loadingToast = toast.loading("Bakım kaydı işleniyor...");
    const payload = buildCompletionPayload({
      clientRequestId: clientRequestId,
      engineId,
      chosenType,
      technicianSource,
      isManagerInternalRecord,
      responsibleTechnicianId,
      responsibleDurationMinutes,
      externalServiceName,
      hours,
      techNote,
      maintenanceStartAt,
      maintenanceEndAt,
      photos,
      videos,
      reportAttachments,
      pressure,
      isBackdated,
      isPrimaryNew,
      primaryPeriod,
      types,
      extraKeys,
      extraPeriods,
      trackedKeys,
      selectedSupportIds,
      otherTechnicianDurations,
      maintenanceDurationMinutes,
      checklistItems,
      checklist,
    });

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
        <CompletionWorkspaceHeader isOnline={isOnline} />

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

          <AdditionalMaintenanceTypes
            types={otherTypes}
            trackedKeys={trackedKeys}
            extraKeys={extraKeys}
            extraPeriods={extraPeriods}
            onToggle={toggleExtra}
            onPeriodChange={(key, value) => setExtraPeriods((current) => ({ ...current, [key]: value }))}
          />

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
