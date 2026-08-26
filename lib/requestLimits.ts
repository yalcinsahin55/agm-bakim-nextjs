/** Base64, ham dosyadan yaklaşık üçte bir daha büyük olduğu için karakter bazlı limit kullanılır. */
export const MAX_IMPORT_BASE64_CHARS = 20 * 1024 * 1024;
export const MAX_BACKUP_REQUEST_BYTES = 60 * 1024 * 1024;
export const MAX_ASSISTANT_REQUEST_BYTES = 10_000;
export const MAX_PUSH_SUBSCRIPTION_REQUEST_BYTES = 32 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Reads a text request body without trusting Content-Length alone.
 * The stream is stopped as soon as the byte limit is exceeded, protecting
 * JSON endpoints from chunked or forged oversized request bodies.
 */
export async function readRequestTextLimited(request: Request, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("Request body limit must be a positive safe integer.");
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
