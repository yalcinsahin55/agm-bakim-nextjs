import { isAllowedReportAttachmentUrl, isReportAttachmentId, isReportAttachmentMime } from "./reportAttachments.ts";

type ReportAttachmentRow = { id?: unknown; url?: unknown; filename?: unknown; mime?: unknown; size?: unknown; uploaded_at?: unknown };

export function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value || 0));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remaining = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (remaining || parts.length === 0) parts.push(`${remaining} dakika`);
  return parts.join(" ");
}

export function formatUnknownDate(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function formatPerformanceNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "veri yok" : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export function safeReportAttachments(recordId: unknown, value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const id = String(recordId || "");
  if (!id) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const attachment = candidate as ReportAttachmentRow;
    if (!isReportAttachmentId(attachment.id) || !isAllowedReportAttachmentUrl(attachment.url)) return [];
    const filename = typeof attachment.filename === "string" && attachment.filename.trim() ? attachment.filename : "rapor-eki";
    if (!isReportAttachmentMime(attachment.mime)) return [];
    const mime = attachment.mime;
    const size = typeof attachment.size === "number" && Number.isFinite(attachment.size) && attachment.size > 0 ? Math.min(20 * 1024 * 1024, Math.round(attachment.size)) : null;
    const uploadedAt = formatUnknownDate(attachment.uploaded_at);
    const attachmentId = String(attachment.id);
    const basePath = `/api/records/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`;
    return [{
      id: attachmentId,
      filename,
      mime,
      size,
      uploaded_at: uploadedAt,
      href: `${basePath}?inline=1`,
      download_href: `${basePath}?download=1`,
    }];
  });
}
