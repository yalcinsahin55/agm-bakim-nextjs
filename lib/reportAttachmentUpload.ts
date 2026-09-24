import {
  REPORT_ATTACHMENT_MAX_BYTES,
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
  type ReportAttachmentMime,
} from "@/lib/reportAttachments";
import { uploadReportAttachmentChunked } from "@/lib/chunkUpload";

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

  const uploaded = await uploadReportAttachmentChunked(file, options);
  return {
    url: uploaded.url,
    mime,
    size: file.size,
  };
}

export const reportAttachmentUploadConfig = {
  clientUpload: false,
  chunkedUpload: true,
} as const;

export { sanitizeReportAttachmentFilename };
