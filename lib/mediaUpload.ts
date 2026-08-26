const SERVER_UPLOAD_ENDPOINT = "/api/blob/upload-server";
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const OIL_ANALYSIS_MAX_BYTES = 10 * 1024 * 1024;
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

interface ServerUploadResponse {
  url?: unknown;
  filename?: unknown;
  error?: unknown;
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

async function uploadThroughServer(
  file: File,
  folder: "photos" | "oil-analyses",
  timeoutMs: number,
  options: MaintenanceMediaUploadOptions = {},
): Promise<{ url: string; filename?: string }> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("folder", folder);
  if (options.idempotencyKey) formData.append("idempotency_key", safeIdempotencyKey(options.idempotencyKey));

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(SERVER_UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({})) as ServerUploadResponse;
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Dosya yüklenemedi.");
    }
    if (typeof data.url !== "string" || !data.url.startsWith("https://")) {
      throw new Error("Dosya yükleme yanıtı geçersiz.");
    }
    return {
      url: data.url,
      ...(typeof data.filename === "string" ? { filename: data.filename } : {}),
    };
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error(folder === "photos"
        ? "Fotoğraf yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin."
        : "PDF yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function uploadOilAnalysisPdf(file: File): Promise<UploadedOilAnalysis> {
  if (file.type !== "application/pdf") throw new Error("Sadece PDF dosyası yükleyebilirsiniz.");
  if (file.size <= 0 || file.size > OIL_ANALYSIS_MAX_BYTES) throw new Error("PDF dosyası 10 MB’tan küçük olmalıdır.");
  const result = await uploadThroughServer(file, "oil-analyses", PHOTO_TIMEOUT_MS);
  return { url: result.url, filename: result.filename || file.name };
}

export async function uploadMaintenanceMedia(
  file: File,
  kind: MaintenanceMediaKind,
  options: MaintenanceMediaUploadOptions = {},
): Promise<string> {
  validateMediaFile(file, kind);
  if (kind === "photo") {
    const result = await uploadThroughServer(file, "photos", PHOTO_TIMEOUT_MS, options);
    return result.url;
  }
  throw new Error("Video upload için uploadVideoChunked kullanılmalıdır.");
}

export const maintenanceMediaUploadConfig = {
  endpoint: SERVER_UPLOAD_ENDPOINT,
  photoMaxBytes: PHOTO_MAX_BYTES,
  videoMaxBytes: VIDEO_MAX_BYTES,
  oilAnalysisMaxBytes: OIL_ANALYSIS_MAX_BYTES,
  photoTimeoutMs: PHOTO_TIMEOUT_MS,
  videoTimeoutMs: VIDEO_TIMEOUT_MS,
} as const;
