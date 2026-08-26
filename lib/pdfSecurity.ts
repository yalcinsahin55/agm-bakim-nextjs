export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DEFAULT_BLOB_HOST_SUFFIXES = [
  ".public.blob.vercel-storage.com",
  ".private.blob.vercel-storage.com",
  ".blob.vercel-storage.com",
] as const;

function configuredAllowedHosts(): string[] {
  return (process.env.PDF_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedPdfUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    const explicitHosts = configuredAllowedHosts();
    return DEFAULT_BLOB_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) || explicitHosts.includes(hostname);
  } catch {
    return false;
  }
}

export async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("Response byte limit must be a positive safe integer.");

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength >= 0 && contentLength > maxBytes) return null;

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= maxBytes ? bytes : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readPdfResponse(response: Response): Promise<Uint8Array | null> {
  return readResponseBytes(response, MAX_PDF_BYTES);
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}
