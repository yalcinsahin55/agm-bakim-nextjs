import { uploadPresigned } from "@vercel/blob/client";

const MEDIA_UPLOAD_ENDPOINT = "/api/blob/upload-presigned";
const PHOTO_CLIENT_PAYLOAD = "maintenance-photo";
const VIDEO_CLIENT_PAYLOAD = "maintenance-video";
const OIL_ANALYSIS_CLIENT_PAYLOAD = "oil-analysis";
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const OIL_ANALYSIS_MAX_BYTES = 10 * 1024 * 1024;
const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 2 * 60 * 1000;
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;

export type MaintenanceMediaKind = "photo" | "video";

export interface MaintenanceMediaUploadOptions {
  idempotencyKey?: string;
}

export interface UploadedOilAnalysis {
  url: string;
  filename: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function safeMediaFilename(filename: string, kind: MaintenanceMediaKind): string {
  const fallback = kind === "photo" ? "photo.jpg" : "video.mp4";
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 180);
  return safe || fallback;
}

function safeIdempotencyKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "retry";
}

function validateMediaFile(file: File, kind: MaintenanceMediaKind): void {
  if (kind === "photo") {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Yalnızca JPEG, PNG veya WebP fotoğraf yükleyebilirsiniz.");
    }
    if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) {
      throw new Error("Fotoğraf 4 MB’tan küçük olmalıdır.");
    }
    return;
  }

  if (!file.type.startsWith("video/")) throw new Error("Sadece video dosyası yükleyebilirsiniz.");
  if (file.size <= 0 || file.size > VIDEO_MAX_BYTES) {
    throw new Error("Video 100 MB’tan küçük olmalıdır.");
  }
}

export async function uploadOilAnalysisPdf(file: File): Promise<UploadedOilAnalysis> {
  if (file.type !== "application/pdf") throw new Error("Sadece PDF dosyası yükleyebilirsiniz.");
  if (file.size <= 0 || file.size > OIL_ANALYSIS_MAX_BYTES) throw new Error("PDF dosyası 10 MB’tan küçük olmalıdır.");

  const safeName = safeMediaFilename(file.name, "photo").replace(/\.(?:jpg|jpeg|png|webp)$/i, ".pdf");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS);
  try {
    const blob = await uploadPresigned(
      `oil-analyses/${Date.now()}-${safeName}`,
      file,
      {
        access: "public",
        handleUploadUrl: MEDIA_UPLOAD_ENDPOINT,
        clientPayload: OIL_ANALYSIS_CLIENT_PAYLOAD,
        contentType: "application/pdf",
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        abortSignal: controller.signal,
      },
    );
    return { url: blob.url, filename: file.name };
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error("PDF yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function uploadMaintenanceMedia(
  file: File,
  kind: MaintenanceMediaKind,
  options: MaintenanceMediaUploadOptions = {},
): Promise<string> {
  validateMediaFile(file, kind);
  const folder = kind === "photo" ? "photos" : "videos";
  const deterministic = Boolean(options.idempotencyKey);
  const clientPayload = kind === "photo"
    ? deterministic ? "maintenance-photo-offline" : PHOTO_CLIENT_PAYLOAD
    : deterministic ? "maintenance-video-offline" : VIDEO_CLIENT_PAYLOAD;
  const contentType = kind === "photo" ? file.type : file.type || "video/mp4";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    kind === "photo" ? PHOTO_TIMEOUT_MS : VIDEO_TIMEOUT_MS,
  );

  try {
    const pathname = deterministic
      ? `${folder}/offline-${safeIdempotencyKey(options.idempotencyKey || "")}-${safeMediaFilename(file.name, kind)}`
      : `${folder}/${Date.now()}-${safeMediaFilename(file.name, kind)}`;
    const blob = await uploadPresigned(
      pathname,
      file,
      {
        access: "public",
        handleUploadUrl: MEDIA_UPLOAD_ENDPOINT,
        clientPayload,
        contentType,
        multipart: kind === "video" && file.size >= MULTIPART_THRESHOLD_BYTES,
        abortSignal: controller.signal,
      },
    );
    return blob.url;
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error(kind === "photo"
        ? "Fotoğraf yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin."
        : "Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const maintenanceMediaUploadConfig = {
  endpoint: MEDIA_UPLOAD_ENDPOINT,
  photoMaxBytes: PHOTO_MAX_BYTES,
  videoMaxBytes: VIDEO_MAX_BYTES,
  multipartThresholdBytes: MULTIPART_THRESHOLD_BYTES,
  photoTimeoutMs: PHOTO_TIMEOUT_MS,
  videoTimeoutMs: VIDEO_TIMEOUT_MS,
} as const;
