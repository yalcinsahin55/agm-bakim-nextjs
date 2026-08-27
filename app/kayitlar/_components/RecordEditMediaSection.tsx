"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import NextImage from "next/image";
import ReportAttachmentPicker from "@/components/ReportAttachmentPicker";
import type { ReportAttachment } from "@/lib/types";
import type { QueuedMedia } from "@/lib/offlineQueue";
import type { VideoItem } from "../_types";
import { getPhotoSrc } from "../_lib/recordMedia";

export type RecordEditMediaSectionProps = {
  photos: string[];
  videos: VideoItem[];
  reportAttachments: ReportAttachment[];
  offlineMedia: QueuedMedia[];
  offlinePreviews: Record<string, string>;
  transientPhotoUrls: Set<string>;
  busy: boolean;
  mediaBusy: boolean;
  setReportAttachments: Dispatch<SetStateAction<ReportAttachment[]>>;
  setReportAttachmentBusy: Dispatch<SetStateAction<boolean>>;
  onPhotoClick: (src: string) => void;
  onAddPhotos: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onAddVideos: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemovePhoto: (index: number) => void;
  onRemoveVideo: (index: number) => void;
  onOfflineReportFile: (file: File, attachment: ReportAttachment) => void;
  onRemoveReportAttachment: (attachment: ReportAttachment) => void;
};

export default function RecordEditMediaSection({
  photos,
  videos,
  reportAttachments,
  offlineMedia,
  offlinePreviews,
  transientPhotoUrls,
  busy,
  mediaBusy,
  setReportAttachments,
  setReportAttachmentBusy,
  onPhotoClick,
  onAddPhotos,
  onAddVideos,
  onRemovePhoto,
  onRemoveVideo,
  onOfflineReportFile,
  onRemoveReportAttachment,
}: RecordEditMediaSectionProps) {
  return <>
    {offlineMedia.length > 0 && (
      <div className="rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-2 text-[10.5px] text-amber">
        {offlineMedia.length} medya/rapor eki bağlantı gelince yüklenecek; kaydettiğinde güncelleme kuyruğa alınır.
      </div>
    )}
    <ReportAttachmentPicker attachments={reportAttachments} onChange={setReportAttachments} onOfflineFile={onOfflineReportFile} onBusyChange={setReportAttachmentBusy} onRemove={onRemoveReportAttachment} disabled={busy || mediaBusy} />
    {photos.length > 0 && (
      <div className="flex gap-1.5 flex-wrap">
        {photos.map((photo, index) => (
          <div key={index} className="relative">
            <button type="button" onClick={() => onPhotoClick(getPhotoSrc(photo, offlinePreviews, transientPhotoUrls))} className="block hover:scale-105 transition-transform" aria-label="Fotoğrafı büyüt">
              <NextImage src={getPhotoSrc(photo, offlinePreviews, transientPhotoUrls)} width={48} height={48} unoptimized className="w-12 h-12 rounded-lg object-cover border border-border" alt="" />
            </button>
            <button type="button" onClick={() => onRemovePhoto(index)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-panel2 border border-border text-[9px] hover:bg-red hover:text-white transition" aria-label="Fotoğrafı kaldır">✕</button>
          </div>
        ))}
      </div>
    )}
    <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
      {mediaBusy ? "Fotoğraf işleniyor..." : "📷 Fotoğraf ekle"}
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || mediaBusy} onChange={onAddPhotos} className="hidden" />
    </label>

    {videos.length > 0 && (
      <div className="flex flex-col gap-1">
        {videos.map((video, index) => (
          <div key={index} className="flex items-center justify-between bg-panel2 rounded-lg px-2.5 py-1.5 text-[11px] text-muted">
            🎬 {video.filename || "Video"}
            <button type="button" onClick={() => onRemoveVideo(index)} className="text-red hover:scale-110 transition" aria-label="Videoyu kaldır">✕</button>
          </div>
        ))}
      </div>
    )}
    <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
      {mediaBusy ? "Video yükleniyor..." : "🎬 Video ekle (max 100MB)"}
      <input type="file" accept="video/*" multiple disabled={busy || mediaBusy} onChange={onAddVideos} className="hidden" />
    </label>
  </>;
}
