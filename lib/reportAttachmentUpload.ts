import { upload } from "@vercel/blob/client";
import {
  REPORT_ATTACHMENT_MAX_BYTES,
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
  type ReportAttachmentMime,
} from "@/lib/reportAttachments";
import { uploadFileThroughServer } from "@/lib/mediaUpload";

export interface UploadedReportAttachment {
  url: string;
  mime: ReportAttachmentMime;
  size: number;
}

export interface ReportAttachmentUploadOptions {
  idempotencyKey?: string;
}

function safeUploadName(file: File, idempotencyKey?: string): string {
  const filename = sanitizeReportAttachmentFilename(file.name);
  const key = idempotencyKey?.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
  return key ? `offline-${key}-${filename}` : filename;
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

  const uploadFile = file.type === mime ? file : new File([file], file.name, { type: mime });
  let uploaded: { url: string };
  try {
    uploaded = await upload(safeUploadName(file, options.idempotencyKey), uploadFile, {
      access: "public",
      handleUploadUrl: "/api/blob/upload-client",
      clientPayload: "maintenance-report",
    });
  } catch (clientUploadError) {
    // Vercel production can temporarily fail to issue a client token when the
    // Blob store/OIDC binding is stale. Keep the upload usable through the
    // existing server-side OIDC path instead of losing the selected file.
    const message = clientUploadError instanceof Error ? clientUploadError.message : "";
    if (!/client token|blob token|retrieve.*token|token/i.test(message)) throw clientUploadError;
    const serverUploaded = await uploadFileThroughServer(
      uploadFile,
      "report-attachments",
      5 * 60 * 1000,
      options,
    );
    uploaded = { url: serverUploaded.url };
  }

  return {
    url: uploaded.url,
    mime,
    size: file.size,
  };
}

export const reportAttachmentUploadConfig = {
  clientUpload: true,
} as const;
