"use client";

import { useState } from "react";
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

  async function openEdit(record: MaintenanceRecord) {
    const detail = await loadRecordMedia(record);
    if (detail) setEditingId(detail._id);
  }

  async function openDetails(record: MaintenanceRecord) {
    const detail = await loadRecordMedia(record);
    if (detail) setSelectedRecord(detail);
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
              getPhotoSrc={(photo) => getPhotoSrc(photo)}
              getVideoSrc={(video) => getVideoSrc(video)}
              onLoadMedia={(record) => void loadRecordMedia(record)}
              onPhotoClick={setSelectedPhoto}
              onVideoClick={(src, filename) => setSelectedVideo({ src, filename })}
              onOpenDetails={(record) => void openDetails(record)}
              onOpenConfirmation={openConfirmation}
              onToggleEdit={(record) => editingId === record._id ? setEditingId(null) : void openEdit(record)}
              onDeleteRequest={(record) => setConfirmDeleteId(record._id)}
              onDeleteConfirm={(record) => void doDelete(record._id)}
              onDeleteCancel={() => setConfirmDeleteId(null)}
              onEditCancel={() => setEditingId(null)}
              onEditSaved={() => {
                setEditingId(null);
                void load(page);
              }}
            />
            <RecordPagination page={page} totalPages={totalPages} onPageChange={(nextPage) => void load(nextPage)} />
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
