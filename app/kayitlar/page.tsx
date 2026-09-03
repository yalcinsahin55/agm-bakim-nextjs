"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import Lightbox from "@/components/Lightbox";
import RecordMediaModals from "@/components/RecordMediaModals";
import MaintenanceRecordDetailsModal from "@/components/MaintenanceRecordDetailsModal";
import MaintenanceConfirmationModal from "@/components/MaintenanceConfirmationModal";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { invalidateMaintenancePanel } from "@/lib/maintenancePanel";
import type { ReportAttachment } from "@/lib/types";
import type { MaintenanceRecord } from "./_types";
import { getPhotoSrc, getVideoSrc } from "./_lib/recordMedia";
import { reportAttachmentUrl, technicianLabel } from "./_lib/recordDisplay";
import { useRecordsPageData } from "./_hooks/useRecordsPageData";
import { useRecordMedia } from "./_hooks/useRecordMedia";
import { useRecordConfirmation } from "./_hooks/useRecordConfirmation";
import RecordFilters from "./_components/RecordFilters";
import RecordList from "./_components/RecordList";
import RecordPagination from "./_components/RecordPagination";

export default function KayitlarPage() {
  const { user } = useCurrentUser();
  const {
    sortedEngines,
    records,
    setRecords,
    total,
    page,
    totalPages,
    loading,
    engineFilter,
    setEngineFilter,
    typeFilter,
    setTypeFilter,
    search,
    setSearch,
    confirmationFilter,
    setConfirmationFilter,
    recordGroups,
    load,
    typeLabels,
  } = useRecordsPageData(user);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<{ src: string; filename: string } | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);
  const [selectedReportAttachment, setSelectedReportAttachment] = useState<{ recordId: string; attachment: ReportAttachment } | null>(null);
  const { loadRecordMedia, mediaLoadingId } = useRecordMedia({ setRecords });
  const {
    confirmationRecord,
    setConfirmationRecord,
    confirmationEngineId,
    setConfirmationEngineId,
    confirmationDurations,
    setConfirmationDurations,
    confirmationRows,
    confirmationTotalMinutes,
    confirmingId,
    isExternalService,
    openConfirmation,
    confirmRecord,
    closeConfirmation,
  } = useRecordConfirmation({ user, setRecords, setSelectedRecord });

  const openEdit = useCallback(async (record: MaintenanceRecord) => {
    const detail = await loadRecordMedia(record);
    if (detail) setEditingId(detail._id);
  }, [loadRecordMedia]);

  const openDetails = useCallback(async (record: MaintenanceRecord) => {
    const detail = await loadRecordMedia(record);
    if (detail) setSelectedRecord(detail);
  }, [loadRecordMedia]);

  const doDelete = useCallback(async (id: string) => {
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
  }, [load, page]);

  const handleLoadMedia = useCallback((record: MaintenanceRecord) => { void loadRecordMedia(record); }, [loadRecordMedia]);
  const handleVideoClick = useCallback((src: string, filename: string) => setSelectedVideo({ src, filename }), []);
  const handleOpenDetails = useCallback((record: MaintenanceRecord) => { void openDetails(record); }, [openDetails]);
  const handleOpenConfirmation = useCallback((record: MaintenanceRecord) => openConfirmation(record), [openConfirmation]);
  const handleToggleEdit = useCallback((record: MaintenanceRecord) => {
    if (editingId === record._id) setEditingId(null);
    else void openEdit(record);
  }, [editingId, openEdit]);
  const handleDeleteRequest = useCallback((record: MaintenanceRecord) => setConfirmDeleteId(record._id), []);
  const handleDeleteConfirm = useCallback((record: MaintenanceRecord) => { void doDelete(record._id); }, [doDelete]);
  const handleDeleteCancel = useCallback(() => setConfirmDeleteId(null), []);
  const handleEditCancel = useCallback(() => setEditingId(null), []);
  const handleEditSaved = useCallback(() => {
    setEditingId(null);
    void load(page);
  }, [load, page]);
  const handlePageChange = useCallback((nextPage: number) => { void load(nextPage); }, [load]);

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
        <section className="relative mb-4 overflow-hidden rounded-card border border-amber/30 bg-gradient-to-br from-amber/10 via-panel to-panel p-4 shadow-lg shadow-black/10" aria-labelledby="records-heading">
          <div className="pointer-events-none absolute -right-10 -top-16 h-36 w-36 rounded-full border border-white/5 bg-white/[0.02]" aria-hidden="true" />
          <div className="relative">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Operasyon merkezi</div>
            <h1 id="records-heading" className="mt-1 text-[23px] font-extrabold tracking-tight text-text">Sıradaki işleri yönet.</h1>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">Bakım kayıtlarını filtrele, önceliklendir ve ilgili aksiyona doğrudan geç.</p>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3" aria-label="Kayıt durum özeti">
            <span className="rounded-full border border-border bg-panel2 px-2.5 py-1 text-[10px] font-bold text-muted"><b className="mr-1 font-mono text-text">{total.toLocaleString("tr-TR")}</b> toplam</span>
            <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-[10px] font-bold text-amber"><b className="mr-1 font-mono">{page} / {totalPages}</b> sayfa</span>
            <span className="rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 text-[10px] font-bold text-teal"><b className="mr-1 font-mono">{records.length}</b> görünür kayıt</span>
          </div>
        </section>

        <RecordFilters
          userRole={user?.role}
          search={search}
          setSearch={setSearch}
          engineFilter={engineFilter}
          setEngineFilter={setEngineFilter}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          sortedEngines={sortedEngines}
          typeLabels={typeLabels}
          confirmationFilter={confirmationFilter}
          setConfirmationFilter={setConfirmationFilter}
          onReset={() => {
            setSearch("");
            setEngineFilter("Tümü");
            setTypeFilter("Tümü");
            setConfirmationFilter("all");
          }}
        />

        <div className="sr-only" aria-live="polite">{records.length === 0 ? "Kayıt bulunamadı." : `${records.length} kayıt gösteriliyor.`}</div>
        {records.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-muted">Kayıt bulunamadı.</p>
            {(search || engineFilter !== "Tümü" || typeFilter !== "Tümü" || confirmationFilter !== "all") && (
              <button
                type="button"
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
            <RecordList
              recordGroups={recordGroups}
              user={user}
              sortedEngines={sortedEngines}
              mediaLoadingId={mediaLoadingId}
              confirmingId={confirmingId}
              editingId={editingId}
              confirmDeleteId={confirmDeleteId}
              technicianLabel={technicianLabel}
              getPhotoSrc={getPhotoSrc}
              getVideoSrc={getVideoSrc}
              onLoadMedia={handleLoadMedia}
              onPhotoClick={setSelectedPhoto}
              onVideoClick={handleVideoClick}
              onOpenDetails={handleOpenDetails}
              onOpenConfirmation={handleOpenConfirmation}
              onToggleEdit={handleToggleEdit}
              onDeleteRequest={handleDeleteRequest}
              onDeleteConfirm={handleDeleteConfirm}
              onDeleteCancel={handleDeleteCancel}
              onEditCancel={handleEditCancel}
              onEditSaved={handleEditSaved}
            />
            <RecordPagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </div>

      {confirmationRecord && (
        <MaintenanceConfirmationModal
          record={confirmationRecord}
          engines={sortedEngines}
          rows={confirmationRows}
          engineId={confirmationEngineId}
          durationInputs={confirmationDurations}
          totalMinutes={confirmationTotalMinutes}
          isExternalService={isExternalService}
          confirming={confirmingId === confirmationRecord._id}
          onEngineChange={setConfirmationEngineId}
          onDurationChange={(technicianId, value) => setConfirmationDurations((current) => ({ ...current, [technicianId]: value }))}
          onClose={() => setConfirmationRecord(null)}
          onCancel={closeConfirmation}
          onConfirm={() => void confirmRecord(confirmationRecord, confirmationDurations, confirmationEngineId)}
        />
      )}

      {selectedRecord && (
        <MaintenanceRecordDetailsModal
          record={selectedRecord}
          technicianLabel={technicianLabel(selectedRecord)}
          isManager={user?.role === "yonetici"}
          isConfirming={confirmingId === selectedRecord._id}
          getPhotoSrc={(photo) => getPhotoSrc(photo)}
          getVideoSrc={(video) => getVideoSrc(video)}
          reportAttachmentUrl={(attachmentId, download = false) => reportAttachmentUrl(selectedRecord._id, attachmentId, download)}
          onClose={() => setSelectedRecord(null)}
          onOpenConfirmation={() => openConfirmation(selectedRecord)}
          onReportAttachment={(attachment) => setSelectedReportAttachment({ recordId: selectedRecord._id, attachment })}
          onPhotoClick={(src) => setSelectedPhoto(src)}
          onVideoClick={(src, filename) => setSelectedVideo({ src, filename })}
        />
      )}

      <RecordMediaModals
        selectedReportAttachment={selectedReportAttachment}
        selectedVideo={selectedVideo}
        reportAttachmentUrl={reportAttachmentUrl}
        onCloseReportAttachment={() => setSelectedReportAttachment(null)}
        onCloseVideo={() => setSelectedVideo(null)}
      />
      {/* Resim Büyütme Penceresi */}
      <Lightbox src={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      <BottomNav />
    </div>
  );
}
