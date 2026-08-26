import type { MaintenanceMediaUploadOptions } from "@/lib/mediaUpload";

const UPLOAD_ENDPOINT = "/api/upload-chunk";
const CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_CHUNKS = 50;
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;

interface ChunkResponse {
  ok?: unknown;
  url?: unknown;
  error?: unknown;
}

function safeUploadId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "retry";
}

function createUploadId(idempotencyKey?: string): string {
  if (idempotencyKey) return safeUploadId(idempotencyKey);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const sliceBytes = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += sliceBytes) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + sliceBytes));
  }
  return btoa(binary);
}

async function postChunk(payload: Record<string, unknown>, signal: AbortSignal): Promise<ChunkResponse> {
  const response = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => ({})) as ChunkResponse;
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Video yüklenemedi (HTTP ${response.status}).`);
  }
  return data;
}

export async function uploadVideoChunked(
  file: File,
  options: MaintenanceMediaUploadOptions = {},
): Promise<string> {
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video 100 MB’tan küçük olmalıdır.");
  }
  if (file.type && !file.type.startsWith("video/")) {
    throw new Error("Sadece video dosyası yükleyebilirsiniz.");
  }

  const total = Math.ceil(file.size / CHUNK_BYTES);
  if (total < 1 || total > MAX_CHUNKS) {
    throw new Error("Video parça sınırını aşıyor. Daha küçük bir video deneyin.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VIDEO_TIMEOUT_MS);
  const uploadId = createUploadId(options.idempotencyKey);
  try {
    for (let index = 0; index < total; index += 1) {
      const start = index * CHUNK_BYTES;
      const chunk = await file.slice(start, Math.min(start + CHUNK_BYTES, file.size)).arrayBuffer();
      const chunkBase64 = arrayBufferToBase64(chunk);
      await postChunk({ upload_id: uploadId, index, chunk_b64: chunkBase64, total }, controller.signal);
    }

    const result = await postChunk({
      finalize: true,
      upload_id: uploadId,
      filename: file.name,
      mime: file.type || "video/mp4",
      total,
    }, controller.signal);
    if (typeof result.url !== "string" || !result.url.startsWith("https://")) {
      throw new Error("Video yükleme yanıtı geçersiz.");
    }
    return result.url;
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new Error("Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
