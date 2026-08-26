"use client";

import NextImage from "next/image";
import type { ReportAttachment, TechnicianType, VideoRef } from "@/lib/types";
import { formatReportAttachmentSize } from "@/lib/reportAttachments";
import { formatMaintenanceDuration, getMaintenanceRecordDate } from "@/lib/maintenanceTime";
import { TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";

type DetailVideo = VideoRef | string;

export interface MaintenanceDetailRecord {
  _id: string;
  type_label: string;
  engine_name: string;
  hour_at_completion: number;
  technician_id: string;
  technician_name: string;
  technician_type?: TechnicianType;
  technician_source?: "internal" | "external_service";
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  technician_note?: string;
  pressure_reading?: number;
  other_technicians?: Array<{ id: string; full_name: string; technician_type?: TechnicianType }>;
  technician_contributions?: Array<{
    id: string;
    full_name: string;
    technician_type?: TechnicianType;
    contribution_role: "responsible" | "support";
    duration_minutes: number;
  }>;
  checklist?: Array<{ label: string; completed: boolean }>;
  completion_confirmed_at?: string | Date;
  manager_confirmation_status?: "pending" | "confirmed";
  manager_confirmed_at?: string | Date;
  manager_confirmed_by_name?: string;
  report_attachments?: ReportAttachment[];
  photos?: string[];
  photos_b64?: string[];
  videos?: DetailVideo[];
  created_at: string | Date;
}

interface MaintenanceRecordDetailsModalProps {
  record: MaintenanceDetailRecord;
  technicianLabel: string;
  isManager: boolean;
  isConfirming: boolean;
  getPhotoSrc: (photo: string) => string;
  getVideoSrc: (video: DetailVideo) => string;
  reportAttachmentUrl: (attachmentId: string, download?: boolean) => string;
  onClose: () => void;
  onOpenConfirmation: () => void;
  onReportAttachment: (attachment: ReportAttachment) => void;
  onPhotoClick: (src: string) => void;
  onVideoClick: (src: string, filename: string) => void;
}

export default function MaintenanceRecordDetailsModal({
  record,
  technicianLabel,
  isManager,
  isConfirming,
  getPhotoSrc,
  getVideoSrc,
  reportAttachmentUrl,
  onClose,
  onOpenConfirmation,
  onReportAttachment,
  onPhotoClick,
  onVideoClick,
}: MaintenanceRecordDetailsModalProps) {
  const photos = record.photos || record.photos_b64 || [];
  const videos = record.videos || [];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="Bakım kaydı detayı">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-panel p-4 shadow-2xl animate-fade-in md:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="text-base font-extrabold text-text">{record.type_label}</div>
            <div className="mt-0.5 text-[11px] text-muted">{record.engine_name} · {getMaintenanceRecordDate(record.maintenance_start_at, record.created_at)?.toLocaleDateString("tr-TR") || "—"}</div>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full border border-border bg-panel2 text-text hover:bg-red hover:text-white" aria-label="Detayı kapat">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Motor saati</div><div className="mt-0.5 font-mono font-bold text-amber">{record.hour_at_completion.toLocaleString("tr-TR")} sa</div></div>
          <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Sorumlu teknisyen</div><div className="mt-0.5 font-semibold text-text">{technicianLabel}</div><div className="mt-0.5 text-[9.5px] text-faint">{TECHNICIAN_TYPE_LABELS[record.technician_type || "mekanik"]}</div></div>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
          <div className="rounded-lg border border-teal/30 bg-teal/10 p-2"><div className="text-faint">Başlangıç</div><div className="mt-0.5 font-mono text-teal">{record.maintenance_start_at ? new Date(record.maintenance_start_at).toLocaleString("tr-TR") : "—"}</div></div>
          <div className="rounded-lg border border-teal/30 bg-teal/10 p-2"><div className="text-faint">Bitiş</div><div className="mt-0.5 font-mono text-teal">{record.maintenance_end_at ? new Date(record.maintenance_end_at).toLocaleString("tr-TR") : "—"}</div></div>
          <div className="rounded-lg border border-amber/30 bg-amber/10 p-2"><div className="text-faint">Toplam bakım süresi</div><div className="mt-0.5 font-bold text-amber">{formatMaintenanceDuration(record.maintenance_duration_minutes)}</div></div>
        </div>
        {record.technician_contributions?.length ? <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal"><b>Teknisyen katkıları:</b><div className="mt-1 flex flex-col gap-0.5">{record.technician_contributions.map((contribution) => <span key={`${contribution.id}-${contribution.contribution_role}`}>{contribution.full_name} · {TECHNICIAN_TYPE_LABELS[contribution.technician_type || "mekanik"]} · {contribution.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · {formatMaintenanceDuration(contribution.duration_minutes)}</span>)}</div></div> : record.other_technicians?.length ? <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal"><b>Bu bakımda çalışan diğer teknisyenler:</b> {record.other_technicians.map((technician) => technician.full_name).join(", ")}</div> : null}
        {record.manager_confirmation_status === "confirmed" ? <div className="mt-2 rounded-lg border border-green/30 bg-green/10 p-2 text-[11px] text-green"><b>✓ Yönetici teyidi:</b> {record.manager_confirmed_by_name || "Yönetici"} · {record.manager_confirmed_at ? new Date(record.manager_confirmed_at).toLocaleString("tr-TR") : "Tarih bilgisi yok"}</div> : record.manager_confirmation_status === "pending" ? <div className="mt-2 rounded-lg border border-amber/40 bg-amber/10 p-2 text-[11px] text-amber"><b>Teyit bekliyor:</b> Bu kayıt yönetici tarafından kontrol edilmelidir. {isManager && <button type="button" onClick={onOpenConfirmation} disabled={isConfirming} className="mt-2 w-full rounded-lg bg-green px-3 py-2 font-bold text-[#071a12] disabled:opacity-50">{isConfirming ? "Teyit ediliyor..." : "✓ Kontrol ettim, teyit et"}</button>}
</div> : <div className="mt-2 rounded-lg border border-border bg-panel2 p-2 text-[11px] text-faint"><b>Eski kayıt:</b> Bu kayıt yönetici teyit akışından önce oluşturulmuş.</div>}
        {record.checklist?.length ? <div className="mt-2 rounded-lg border border-green/30 bg-green/10 p-2 text-[11px] text-green"><b>Bakım kanıtı:</b> Kontrol listesi tamamlandı{record.completion_confirmed_at ? ` · ${new Date(record.completion_confirmed_at).toLocaleString("tr-TR")}` : ""}<div className="mt-1 flex flex-col gap-0.5 text-[10px]">{record.checklist.map((item) => <span key={item.label}>✓ {item.label}</span>)}</div></div> : null}
        {record.pressure_reading != null && <div className="mt-2 rounded-lg border border-teal/30 bg-teal/10 p-2 text-[11px] text-teal">Fark basıncı: <b>{record.pressure_reading} bar</b></div>}
        {record.technician_note && <div className="mt-2 rounded-lg border border-border bg-panel2 p-2 text-[11px] leading-relaxed text-muted"><b className="text-text">Not:</b> {record.technician_note}</div>}
        {record.report_attachments?.length ? <div className="mt-4 rounded-xl border border-purple-400/30 bg-purple-400/5 p-3"><div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-purple-200">Detaylı rapor ekleri</div><div className="flex flex-col gap-1.5">{record.report_attachments.map((attachment) => { const label = <><span className="min-w-0 truncate font-bold">{attachment.filename}</span><span className="flex-shrink-0 text-[9px] text-faint">{attachment.mime === "application/pdf" ? "PDF · Uygulama içinde aç" : attachment.mime.includes("spreadsheet") || attachment.mime.includes("excel") ? "Excel · İndir" : "Word · İndir"} · {formatReportAttachmentSize(attachment.size)} {attachment.mime === "application/pdf" ? "›" : "↓"}</span></>; return attachment.mime === "application/pdf" ? <button key={attachment.id} type="button" onClick={() => onReportAttachment(attachment)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-panel2 px-2.5 py-2 text-left text-[10.5px] text-text hover:border-purple-300" aria-label={`${attachment.filename} PDF önizlemesini aç`}>{label}</button> : <a key={attachment.id} href={reportAttachmentUrl(attachment.id, true)} download={attachment.filename} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-panel2 px-2.5 py-2 text-left text-[10.5px] text-text hover:border-purple-300" aria-label={`${attachment.filename} dosyasını indir`}>{label}</a>; })}</div></div> : null}
        {(photos.length > 0 || videos.length > 0) && (
          <div className="mt-4">
            <div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-muted">Medya</div>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, index) => <button type="button" key={`detail-photo-${index}`} onClick={() => onPhotoClick(getPhotoSrc(photo))} className="overflow-hidden rounded-lg border border-border hover:scale-105 transition-transform"><NextImage src={getPhotoSrc(photo)} width={80} height={80} unoptimized className="h-20 w-20 object-cover" alt={`Bakım fotoğrafı ${index + 1}`} /></button>)}
              {videos.map((video, index) => { const src = getVideoSrc(video); return src ? <button type="button" key={`detail-video-${index}`} onClick={() => onVideoClick(src, typeof video === "string" ? "Video" : video.filename || "Video")} className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-black text-2xl text-white">▶</button> : null; })}
            </div>
          </div>
        )}
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-border py-2.5 text-[12px] font-bold text-muted hover:bg-panel2">Kapat</button>
      </div>
    </div>
  );
}
