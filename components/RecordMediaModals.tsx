"use client";

import PdfPreview from "@/components/PdfPreview";
import type { ReportAttachment } from "@/lib/types";

interface SelectedReportAttachment {
  recordId: string;
  attachment: ReportAttachment;
}

interface SelectedVideo {
  src: string;
  filename: string;
}

interface RecordMediaModalsProps {
  selectedReportAttachment: SelectedReportAttachment | null;
  selectedVideo: SelectedVideo | null;
  reportAttachmentUrl: (recordId: string, attachmentId: string, download?: boolean) => string;
  onCloseReportAttachment: () => void;
  onCloseVideo: () => void;
}

export default function RecordMediaModals({
  selectedReportAttachment,
  selectedVideo,
  reportAttachmentUrl,
  onCloseReportAttachment,
  onCloseVideo,
}: RecordMediaModalsProps) {
  return (
    <>
      {selectedReportAttachment && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 backdrop-blur-sm md:items-center md:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedReportAttachment.attachment.filename} PDF önizlemesi`}
          onClick={onCloseReportAttachment}
        >
          <div
            className="flex h-[92dvh] w-full max-w-4xl flex-col rounded-t-2xl border border-border bg-panel p-3 shadow-2xl md:h-[88vh] md:rounded-2xl md:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex min-h-10 items-center justify-between gap-2 border-b border-border pb-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold text-text">📄 {selectedReportAttachment.attachment.filename}</div>
                <div className="mt-0.5 text-[10px] text-faint">PDF önizleme · bakım kaydı içinde</div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <a
                  href={reportAttachmentUrl(selectedReportAttachment.recordId, selectedReportAttachment.attachment.id, true)}
                  className="rounded-lg border border-amber/40 px-2.5 py-1.5 text-[10px] font-bold text-amber"
                  download={selectedReportAttachment.attachment.filename}
                >
                  İndir
                </a>
                <button
                  type="button"
                  onClick={onCloseReportAttachment}
                  className="h-8 w-8 rounded-full border border-border bg-panel2 text-text hover:bg-red hover:text-white"
                  aria-label="PDF önizlemesini kapat"
                >
                  ✕
                </button>
              </div>
            </div>
            <PdfPreview
              src={reportAttachmentUrl(selectedReportAttachment.recordId, selectedReportAttachment.attachment.id)}
              filename={selectedReportAttachment.attachment.filename}
            />
          </div>
        </div>
      )}
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
              onClick={onCloseVideo}
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
    </>
  );
}

export type { RecordMediaModalsProps, SelectedReportAttachment, SelectedVideo };
