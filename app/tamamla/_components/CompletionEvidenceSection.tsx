"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import MaintenanceEvidencePreview from "@/components/MaintenanceEvidencePreview";
import ReportAttachmentPicker from "@/components/ReportAttachmentPicker";
import type { ReportAttachment, VideoRef } from "@/lib/types";

type CompletionEvidenceSectionProps = {
  techNote: string;
  setTechNote: Dispatch<SetStateAction<string>>;
  photos: string[];
  videos: VideoRef[];
  reportAttachments: ReportAttachment[];
  offlinePreviews: Record<string, string>;
  photoBusy: boolean;
  videoBusy: boolean;
  submitting: boolean;
  evidenceReady: boolean;
  setReportAttachments: Dispatch<SetStateAction<ReportAttachment[]>>;
  setReportAttachmentBusy: Dispatch<SetStateAction<boolean>>;
  onPhotosChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onVideosChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOfflineReportFile: (file: File, attachment: ReportAttachment) => void;
  onRemoveReportAttachment: (attachment: ReportAttachment) => void;
  onPhotoClick: (src: string) => void;
  onRemovePhoto: (index: number) => void;
  onRemoveVideo: (index: number) => void;
};

export default function CompletionEvidenceSection({
  techNote,
  setTechNote,
  photos,
  videos,
  reportAttachments,
  offlinePreviews,
  photoBusy,
  videoBusy,
  submitting,
  evidenceReady,
  setReportAttachments,
  setReportAttachmentBusy,
  onPhotosChange,
  onVideosChange,
  onOfflineReportFile,
  onRemoveReportAttachment,
  onPhotoClick,
  onRemovePhoto,
  onRemoveVideo,
}: CompletionEvidenceSectionProps) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4" aria-labelledby="evidence-heading">
      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">06 · Kanıt ve notlar</div>
        <h2 id="evidence-heading" className="mt-1 text-base font-extrabold text-text">Bakım kanıtları</h2>
        <p className="mt-1 text-[10px] text-faint">En az bir not, fotoğraf/video veya PDF/Excel/Word rapor eki eklenmesi zorunludur.</p>
      </div>
      <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
        Bakımcı notu
        <textarea value={techNote} onChange={(event) => setTechNote(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-lg border border-border bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-amber" />
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-[84px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-3 py-3 text-center text-[10px] text-muted hover:border-amber/60">
          <span>{photoBusy ? "Fotoğraflar işleniyor..." : "Fotoğraf ekle"}<span className="mt-1 block text-[9px] text-faint">Birden fazla seçebilirsiniz</span></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={submitting || photoBusy || videoBusy} onChange={onPhotosChange} className="hidden" />
        </label>
        <label className="flex min-h-[84px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-3 py-3 text-center text-[10px] text-muted hover:border-amber/60">
          <span>{videoBusy ? "Videolar yükleniyor..." : "Video ekle"}<span className="mt-1 block text-[9px] text-faint">En fazla 5 adet · 100MB</span></span>
          <input type="file" accept="video/*" multiple disabled={submitting || photoBusy || videoBusy} onChange={onVideosChange} className="hidden" />
        </label>
      </div>
      <ReportAttachmentPicker attachments={reportAttachments} onChange={setReportAttachments} onOfflineFile={onOfflineReportFile} onBusyChange={setReportAttachmentBusy} onRemove={onRemoveReportAttachment} disabled={submitting} />
      <MaintenanceEvidencePreview
        photos={photos}
        videos={videos}
        offlinePreviews={offlinePreviews}
        onPhotoClick={onPhotoClick}
        onRemovePhoto={onRemovePhoto}
        onRemoveVideo={onRemoveVideo}
      />
      {!evidenceReady && <div className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2.5 text-[10.5px] text-amber" role="status">Bakımı kaydetmek için en az bir bakım notu, fotoğraf/video veya PDF/Excel/Word rapor eki kanıtı ekleyin.</div>}
    </section>
  );
}
