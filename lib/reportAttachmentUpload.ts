import { uploadFileThroughServer } from "@/lib/mediaUpload";
import {
  REPORT_ATTACHMENT_MAX_BYTES,
  resolveReportAttachmentMime,
  type ReportAttachmentMime,
} from "@/lib/reportAttachments";

const REPORT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export interface UploadedReportAttachment {
  url: string;
  mime: ReportAttachmentMime;
  size: number;
}

export interface ReportAttachmentUploadOptions {
  idempotencyKey?: string;
}

export async function uploadReportAttachment(
  file: File,
  options: ReportAttachmentUploadOptions = {},
): Promise<UploadedReportAttachment> {
  const mime = resolveReportAttachmentMime(file.type, file.name);
  if (!mime) throw new Error("Yalnızca PDF, Excel veya Word dosyaları yüklenebilir.");
  if (file.size <= 0 || file.size > REPORT_ATTACHMENT_MAX_BYTES) {
    throw new Error("Rapor eki 20 MB’tan küçük olmalıdır.");
  }

  const uploaded = await uploadFileThroughServer(
    file,
    "report-attachments",
    REPORT_UPLOAD_TIMEOUT_MS,
    options,
  );

  return {
    url: uploaded.url,
    mime: resolveReportAttachmentMime(uploaded.mime, file.name) || mime,
    size: uploaded.size || file.size,
  };
}

export const reportAttachmentUploadConfig = {
  timeoutMs: REPORT_UPLOAD_TIMEOUT_MS,
} as const;
