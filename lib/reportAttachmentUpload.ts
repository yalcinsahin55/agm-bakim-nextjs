import { uploadPresigned } from "@vercel/blob/client";
import {
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
  type ReportAttachmentMime,
} from "@/lib/reportAttachments";

const REPORT_UPLOAD_ENDPOINT = "/api/blob/upload-presigned";
const REPORT_UPLOAD_CLIENT_PAYLOAD = "maintenance-report";
const REPORT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const REPORT_UPLOAD_MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;

export interface UploadedReportAttachment {
  url: string;
  mime: ReportAttachmentMime;
  size: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function uploadReportAttachment(file: File): Promise<UploadedReportAttachment> {
  const mime = resolveReportAttachmentMime(file.type, file.name);
  if (!mime) throw new Error("Yalnızca PDF, Excel veya Word dosyaları yüklenebilir.");

  const safeName = sanitizeReportAttachmentFilename(file.name);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REPORT_UPLOAD_TIMEOUT_MS);

  try {
    const blob = await uploadPresigned(
      `report-attachments/${Date.now()}-${safeName}`,
      file,
      {
        access: "public",
        handleUploadUrl: REPORT_UPLOAD_ENDPOINT,
        clientPayload: REPORT_UPLOAD_CLIENT_PAYLOAD,
        contentType: mime,
        multipart: file.size >= REPORT_UPLOAD_MULTIPART_THRESHOLD_BYTES,
        abortSignal: abortController.signal,
      },
    );

    return {
      url: blob.url,
      mime: resolveReportAttachmentMime(blob.contentType, file.name) || mime,
      size: file.size,
    };
  } catch (error) {
    if (abortController.signal.aborted || isAbortError(error)) {
      throw new Error("Rapor eki yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const reportAttachmentUploadConfig = {
  timeoutMs: REPORT_UPLOAD_TIMEOUT_MS,
  multipartThresholdBytes: REPORT_UPLOAD_MULTIPART_THRESHOLD_BYTES,
} as const;

export { REPORT_UPLOAD_ENDPOINT, REPORT_UPLOAD_CLIENT_PAYLOAD };
