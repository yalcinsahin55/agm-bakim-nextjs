"use client";

import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { ReportAttachment } from "@/lib/types";
import {
  REPORT_ATTACHMENT_ACCEPT,
  REPORT_ATTACHMENT_MAX_BYTES,
  REPORT_ATTACHMENT_MAX_COUNT,
  formatReportAttachmentSize,
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
} from "@/lib/reportAttachments";

interface UploadResponse {
  url?: string;
  filename?: string;
  mime?: ReportAttachment["mime"];
  size?: number;
  error?: string;
}

interface ReportAttachmentPickerProps {
  attachments: ReportAttachment[];
  onChange: (attachments: ReportAttachment[]) => void;
  onOfflineFile?: (file: File, attachment: ReportAttachment) => void;
  onBusyChange?: (busy: boolean) => void;
  onRemove?: (attachment: ReportAttachment) => void;
  disabled?: boolean;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileTypeLabel(mime: ReportAttachment["mime"]): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("spreadsheet")) return "Excel";
  if (mime.includes("excel")) return "Excel";
  return "Word";
}

function createAttachment(file: File, mime: ReportAttachment["mime"], url: string): ReportAttachment {
  return {
    id: makeId(),
    url,
    filename: sanitizeReportAttachmentFilename(file.name),
    mime,
    size: file.size,
    uploaded_at: new Date().toISOString(),
  };
}

export default function ReportAttachmentPicker({
  attachments,
  onChange,
  onOfflineFile,
  onBusyChange,
  onRemove,
  disabled = false,
}: ReportAttachmentPickerProps) {
  const [busy, setBusy] = useState(false);

  function setBusyState(value: boolean): void {
    setBusy(value);
    onBusyChange?.(value);
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || disabled) return;
    if (attachments.length + files.length > REPORT_ATTACHMENT_MAX_COUNT) {
      toast.warning(`Toplamda en fazla ${REPORT_ATTACHMENT_MAX_COUNT} rapor eki ekleyebilirsiniz.`);
      return;
    }

    setBusyState(true);
    let nextAttachments = attachments;
    try {
      for (const file of files) {
        const mime = resolveReportAttachmentMime(file.type, file.name);
        if (!mime) {
          toast.error(`${file.name}: yalnızca PDF, Excel veya Word dosyası kabul edilir.`);
          continue;
        }
        if (file.size <= 0 || file.size > REPORT_ATTACHMENT_MAX_BYTES) {
          toast.error(`${file.name}: dosya boyutu 20 MB’tan küçük olmalıdır.`);
          continue;
        }

        if (!navigator.onLine) {
          const attachment = createAttachment(file, mime, `offline:${makeId()}`);
          nextAttachments = [...nextAttachments, attachment];
          onChange(nextAttachments);
          onOfflineFile?.(file, attachment);
          continue;
        }

        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("folder", "report-attachments");
          const response = await fetch("/api/blob/upload-server", { method: "POST", body: formData });
          const data = await response.json().catch(() => ({})) as UploadResponse;
          if (!response.ok || !data.url) throw new Error(data.error || "Rapor eki yüklenemedi.");
          const attachment = createAttachment(file, data.mime || mime, data.url);
          nextAttachments = [...nextAttachments, attachment];
          onChange(nextAttachments);
        } catch (error) {
          if (!navigator.onLine) {
            const attachment = createAttachment(file, mime, `offline:${makeId()}`);
            nextAttachments = [...nextAttachments, attachment];
            onChange(nextAttachments);
            onOfflineFile?.(file, attachment);
            continue;
          }
          toast.error(`${file.name}: ${error instanceof Error ? error.message : "yüklenemedi."}`);
        }
      }
    } finally {
      setBusyState(false);
    }
  }

  function removeAttachment(attachment: ReportAttachment): void {
    onRemove?.(attachment);
    onChange(attachments.filter((item) => item.id !== attachment.id));
  }

  return (
    <div className="mt-3 rounded-xl border border-purple-400/30 bg-purple-400/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-purple-200">Detaylı rapor ekleri</div>
          <p className="mt-1 text-[10px] leading-4 text-faint">PDF, Excel veya Word raporlarını kayda iliştirin. Dosya başına en fazla 20 MB, kayıt başına en fazla 10 dosya.</p>
        </div>
        <span className="flex-shrink-0 rounded-full border border-purple-400/30 px-2 py-1 text-[9px] font-bold text-purple-200">{attachments.length}/{REPORT_ATTACHMENT_MAX_COUNT}</span>
      </div>
      <label className={`mt-3 flex min-h-[64px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-purple-400/40 px-3 py-3 text-center text-[10.5px] text-muted hover:border-purple-300 ${disabled || busy ? "cursor-not-allowed opacity-60" : ""}`}>
        <span>{busy ? "Rapor eki yükleniyor..." : "PDF / Excel / Word ekle"}<span className="mt-1 block text-[9px] text-faint">.pdf · .xls/.xlsx · .doc/.docx</span></span>
        <input type="file" accept={REPORT_ATTACHMENT_ACCEPT} multiple disabled={disabled || busy || attachments.length >= REPORT_ATTACHMENT_MAX_COUNT} onChange={(event) => void handleFiles(event)} className="hidden" />
      </label>
      {attachments.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel2 px-2.5 py-2 text-[10.5px]">
              <div className="min-w-0">
                <div className="truncate font-bold text-text">{attachment.filename}</div>
                <div className="mt-0.5 text-[9px] text-faint">{fileTypeLabel(attachment.mime)} · {formatReportAttachmentSize(attachment.size)}{attachment.url.startsWith("offline:") ? " · bağlantı gelince yüklenecek" : ""}</div>
              </div>
              <button type="button" onClick={() => removeAttachment(attachment)} disabled={disabled || busy} className="flex-shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-bold text-red hover:bg-red/10 disabled:opacity-50" aria-label={`${attachment.filename} rapor ekini kaldır`}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
