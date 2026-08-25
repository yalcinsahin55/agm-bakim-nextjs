import { upload } from "@vercel/blob/client";
import {
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
  type ReportAttachmentMime,
} from "@/lib/reportAttachments";

const REPORT_UPLOAD_ENDPOINT = "/api/blob/upload-client";
const REPORT_UPLOAD_CLIENT_PAYLOAD = "maintenance-report";

export interface UploadedReportAttachment {
  url: string;
  mime: ReportAttachmentMime;
  size: number;
}

export async function uploadReportAttachment(file: File): Promise<UploadedReportAttachment> {
  const mime = resolveReportAttachmentMime(file.type, file.name);
  if (!mime) throw new Error("Yalnızca PDF, Excel veya Word dosyaları yüklenebilir.");

  const safeName = sanitizeReportAttachmentFilename(file.name);
  const blob = await upload(
    `report-attachments/${Date.now()}-${safeName}`,
    file,
    {
      access: "public",
      handleUploadUrl: REPORT_UPLOAD_ENDPOINT,
      clientPayload: REPORT_UPLOAD_CLIENT_PAYLOAD,
      contentType: mime,
    },
  );

  return {
    url: blob.url,
    mime: resolveReportAttachmentMime(blob.contentType, file.name) || mime,
    size: file.size,
  };
}
