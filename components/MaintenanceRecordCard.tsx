"use client";

import type { ReactNode } from "react";
import NextImage from "next/image";
import type { ReportAttachment, VideoRef } from "@/lib/types";
import { formatMaintenanceDuration, getMaintenanceRecordDate } from "@/lib/maintenanceTime";
import type { TechnicianType } from "@/lib/types";

export type RecordCardVideo = VideoRef | string;

export interface MaintenanceRecordCardData {
  _id: string;
  engine_name: string;
  type_label: string;
  hour_at_completion: number;
  technician_name: string;
  technician_id: string;
  technician_type?: TechnicianType;
  technician_source?: "internal" | "external_service";
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  technician_note?: string;
  pressure_reading?: number;
  created_at: string | Date;
  group_id?: string | null;
  photos?: string[];
  photos_b64?: string[];
  videos?: RecordCardVideo[];
  other_technicians?: Array<{ id: string; full_name: string; technician_type?: TechnicianType }>;
  report_attachments?: ReportAttachment[];
  manager_confirmation_status?: "pending" | "confirmed";
}

interface MaintenanceRecordCardProps {
  record: MaintenanceRecordCardData;
  technicianLabel: string;
  canEdit: boolean;
  isManager: boolean;
  isMediaLoading: boolean;
  isConfirming: boolean;
  isEditing: boolean;
  deletePending: boolean;
  getPhotoSrc: (photo: string) => string;
  getVideoSrc: (video: RecordCardVideo) => string;
  onLoadMedia: () => void;
  onPhotoClick: (src: string) => void;
  onVideoClick: (src: string, filename: string) => void;
  onOpenDetails: () => void;
  onOpenConfirmation: () => void;
  onToggleEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  editForm?: ReactNode;
}

export default function MaintenanceRecordCard({
  record,
  technicianLabel,
  canEdit,
  isManager,
  isMediaLoading,
  isConfirming,
  isEditing,
  deletePending,
  getPhotoSrc,
  getVideoSrc,
  onLoadMedia,
  onPhotoClick,
  onVideoClick,
  onOpenDetails,
  onOpenConfirmation,
  onToggleEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  editForm,
}: MaintenanceRecordCardProps) {
  const photos = record.photos || record.photos_b64 || [];
  const videos = record.videos || [];
  const showMedia = !record.group_id || photos.length > 0 || videos.length > 0;

  return (
    <div className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
      {!photos.length && !videos.length && <button type="button" onClick={onLoadMedia} disabled={isMediaLoading} className="mb-2 rounded-lg border border-border px-2.5 py-1.5 text-[10.5px] font-bold text-muted hover:border-teal/40 hover:text-teal disabled:opacity-50">{isMediaLoading ? "Medya yükleniyor..." : "📎 Medyayı görüntüle"}</button>}
      {showMedia && photos.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{photos.map((photo, index) => <button key={index} type="button" onClick={() => onPhotoClick(getPhotoSrc(photo))} className="hover:scale-105 transition-transform" aria-label="Fotoğrafı büyüt"><NextImage src={getPhotoSrc(photo)} width={56} height={56} unoptimized className="h-14 w-14 rounded-lg border border-border object-cover" alt="" /></button>)}</div>}
      {showMedia && videos.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{videos.map((video, index) => { const videoSrc = getVideoSrc(video); if (!videoSrc) return null; const filename = typeof video === "string" ? "Video" : video.filename || "Video"; return <button key={index} type="button" onClick={() => onVideoClick(videoSrc, filename)} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-panel2 hover:scale-105 transition-transform" aria-label={`${filename} videosunu oynat`}><video muted preload="metadata" className="pointer-events-none h-full w-full object-cover"><source src={videoSrc} /></video><span className="absolute inset-0 flex items-center justify-center bg-black/35 text-xl text-white">▶</span></button>; })}</div>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="truncate text-[13px] font-bold text-text">{record.engine_name}</div><div className="mt-0.5 truncate text-[11px] font-semibold text-teal">{record.type_label}</div></div>
        {record.manager_confirmation_status === "confirmed" ? <span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2 py-0.5 text-[9px] font-bold text-green">✓ Teyitli</span> : record.manager_confirmation_status === "pending" ? <span className="flex-shrink-0 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[9px] font-bold text-amber">Teyit bekliyor</span> : <span className="flex-shrink-0 rounded-full border border-border bg-panel2 px-2 py-0.5 text-[9px] font-bold text-faint">Eski kayıt</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-faint">{getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "—"} · {record.hour_at_completion.toLocaleString("tr-TR")} sa · {technicianLabel}</div>
      {(record.maintenance_start_at || record.maintenance_end_at || record.maintenance_duration_minutes != null) && <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-teal"><span>Başlangıç: {record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "—"}</span><span>Bitiş: {record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "—"}</span><span>Süre: {formatMaintenanceDuration(record.maintenance_duration_minutes)}</span></div>}
      {record.pressure_reading != null && <div className="mt-1 text-[11.5px] text-muted">📈 Fark Basıncı: {record.pressure_reading} bar</div>}
      {record.technician_note && <div className="mt-1 text-[11.5px] text-muted">🗒️ {record.technician_note}</div>}
      {record.other_technicians?.length ? <div className="mt-1 text-[11px] text-muted">👥 Ekip: {record.other_technicians.map((technician) => technician.full_name).join(", ")}</div> : null}
      {record.report_attachments?.length ? <div className="mt-1 text-[11px] text-purple-200">📄 {record.report_attachments.length} detaylı rapor eki</div> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onOpenDetails} className="rounded-lg border border-amber/40 px-2.5 py-1.5 text-[11px] font-bold text-amber hover:bg-amber/10 transition">🔎 Detay</button>
        {isManager && record.manager_confirmation_status === "pending" && <button type="button" onClick={onOpenConfirmation} disabled={isConfirming} className="rounded-lg bg-green px-2.5 py-1.5 text-[11px] font-bold text-[#071a12] hover:brightness-110 transition disabled:opacity-50">{isConfirming ? "Teyit ediliyor..." : "✓ Teyit et"}</button>}
        {canEdit && <>
          <button type="button" onClick={onToggleEdit} className="rounded-lg border border-teal/40 px-2.5 py-1.5 text-[11px] font-bold text-teal hover:bg-teal/10 transition">✏️ Düzenle</button>
          {deletePending ? <><button type="button" onClick={onDeleteConfirm} className="rounded-lg bg-red px-2.5 py-1.5 text-[11px] font-bold text-bg hover:brightness-110 transition">Evet, Sil</button><button type="button" onClick={onDeleteCancel} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted hover:bg-panel2 transition">Vazgeç</button></> : <button type="button" onClick={onDeleteRequest} className="rounded-lg border border-red/40 px-2.5 py-1.5 text-[11px] font-bold text-red hover:bg-red/10 transition">🗑️ Sil</button>}
        </>}
      </div>
      {isEditing ? editForm : null}
    </div>
  );
}
