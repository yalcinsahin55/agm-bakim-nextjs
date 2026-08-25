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

export interface ReportAttachmentUploadOptions {
  idempotencyKey?: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function safeIdempotencyKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "retry";
}

export async function uploadReportAttachment(
  file: File,
  options: ReportAttachmentUploadOptions = {},
): Promise<UploadedReportAttachment> {
  const mime = resolveReportAttachmentMime(file.type, file.name);
  if (!mime) throw new Error("Yalnızca PDF, Excel veya Word dosyaları yüklenebilir.");

  const safeName = sanitizeReportAttachmentFilename(file.name);
  const deterministic = Boolean(options.idempotencyKey);
  const clientPayload = deterministic ? "maintenance-report-offline" : REPORT_UPLOAD_CLIENT_PAYLOAD;
  const pathname = deterministic
    ? `report-attachments/offline-${safeIdempotencyKey(options.idempotencyKey || "")}-${safeName}`
    : `report-attachments/${Date.now()}-${safeName}`;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REPORT_UPLOAD_TIMEOUT_MS);

  try {
    const blob = await uploadPresigned(
      pathname,
      file,
      {
        access: "public",
        handleUploadUrl: REPORT_UPLOAD_ENDPOINT,
        clientPayload,
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
