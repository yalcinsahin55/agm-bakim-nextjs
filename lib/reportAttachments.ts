export const REPORT_ATTACHMENT_MAX_COUNT = 10;
export const REPORT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const REPORT_ATTACHMENT_MAX_FILENAME_LENGTH = 180;

export const REPORT_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type ReportAttachmentMime = (typeof REPORT_ATTACHMENT_MIME_TYPES)[number];

const REPORT_ATTACHMENT_EXTENSION_MIMES: Record<string, ReportAttachmentMime> = {
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const DEFAULT_BLOB_HOST_SUFFIXES = [
  ".public.blob.vercel-storage.com",
  ".blob.vercel-storage.com",
] as const;

function configuredAllowedHosts(): string[] {
  return (process.env.REPORT_ATTACHMENT_ALLOWED_HOSTS || process.env.PDF_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isReportAttachmentMime(value: unknown): value is ReportAttachmentMime {
  return typeof value === "string" && (REPORT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function getReportAttachmentExtension(filename: string): string {
  const match = filename.trim().toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] || "";
}

/**
 * Some mobile browsers report Office files as application/octet-stream or omit
 * the MIME. We only allow that fallback when the filename has a known Office/PDF
 * extension; the stored metadata is always normalized to the canonical MIME.
 */
export function resolveReportAttachmentMime(value: unknown, filename: string): ReportAttachmentMime | null {
  if (isReportAttachmentMime(value)) return value;
  if (value === "" || value === "application/octet-stream" || value === undefined || value === null) {
    return REPORT_ATTACHMENT_EXTENSION_MIMES[getReportAttachmentExtension(filename)] || null;
  }
  return null;
}

export function sanitizeReportAttachmentFilename(filename: string): string {
  const fallback = "rapor-eki";
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  const safe = normalized || fallback;
  return safe.slice(-REPORT_ATTACHMENT_MAX_FILENAME_LENGTH);
}

export function isAllowedReportAttachmentUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    const explicitHosts = configuredAllowedHosts();
    const isVercelBlobHost = DEFAULT_BLOB_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
    return isVercelBlobHost || explicitHosts.includes(hostname);
  } catch {
    return false;
  }
}

export function isReportAttachmentId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
}

export function formatReportAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeReportAttachments(value: unknown, userId: string): Array<{
  id: string;
  url: string;
  filename: string;
  mime: ReportAttachmentMime;
  size: number;
  uploaded_at: string;
  uploaded_by_id: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const id = item.id;
    const url = item.url;
    const filename = item.filename;
    const mime = item.mime;
    const size = item.size;
    const uploadedAt = item.uploaded_at;
    if (!isReportAttachmentId(id) || typeof url !== "string" || (!url.startsWith("offline:") && !isAllowedReportAttachmentUrl(url))) return [];
    if (typeof filename !== "string" || !filename.trim() || !isReportAttachmentMime(mime)) return [];
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0 || size > REPORT_ATTACHMENT_MAX_BYTES) return [];
    if (typeof uploadedAt !== "string" || !Number.isFinite(Date.parse(uploadedAt))) return [];
    return [{
      id,
      url,
      filename: sanitizeReportAttachmentFilename(filename),
      mime,
      size,
      uploaded_at: uploadedAt,
      uploaded_by_id: typeof item.uploaded_by_id === "string" && item.uploaded_by_id ? item.uploaded_by_id : userId,
    }];
  });
}

export const REPORT_ATTACHMENT_ACCEPT = ".pdf,.xls,.xlsx,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
