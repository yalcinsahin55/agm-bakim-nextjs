const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MAX_RETRIES = 2;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length)));
  }
  return btoa(binary);
}

async function postChunk(body: Record<string, unknown>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch("/api/upload-chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `Video parçası yüklenemedi (HTTP ${response.status}).`);
      return;
    } catch (error) {
      lastError = error instanceof DOMException && error.name === "AbortError"
        ? new Error("Video parçası yükleme zaman aşımına uğradı.")
        : error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, 800 * (attempt + 1)));
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Video parçası yüklenemedi.");
}

export async function uploadVideoChunked(file: File): Promise<string> {
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error("Video 100 MB’tan küçük olmalıdır.");
  }
  if (!file.type.startsWith("video/")) {
    throw new Error("Sadece video dosyası yükleyebilirsiniz.");
  }

  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  const uploadId = `${Date.now()}-${randomId}`;
  const total = Math.ceil(file.size / CHUNK_SIZE);

  for (let index = 0; index < total; index += 1) {
    const start = index * CHUNK_SIZE;
    const chunk = new Uint8Array(await file.slice(start, Math.min(start + CHUNK_SIZE, file.size)).arrayBuffer());
    await postChunk({
      upload_id: uploadId,
      index,
      total,
      chunk_b64: bytesToBase64(chunk),
    });
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch("/api/upload-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_id: uploadId,
        filename: file.name,
        mime: file.type || "video/mp4",
        total,
        finalize: true,
      }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || "Video Blob’a yüklenemedi.");
    return result.url;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Video birleştirme zaman aşımına uğradı.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
