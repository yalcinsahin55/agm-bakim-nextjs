import { get } from "@vercel/blob";

const PUBLIC_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";
const GENERIC_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";
const BLOB_READ_TIMEOUT_MS = 20_000;

function isPublicBlobUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase().endsWith(PUBLIC_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function isPrivateBlobUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return !hostname.endsWith(PUBLIC_BLOB_HOST_SUFFIX)
      && (hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX) || hostname.endsWith(GENERIC_BLOB_HOST_SUFFIX));
  } catch {
    return false;
  }
}

function readBlobCredentials(): { token?: string; storeId?: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN;
  const storeId = process.env.BLOB_STORE_ID || process.env.MEDIA_STORE_ID;
  return {
    ...(token ? { token } : {}),
    ...(storeId ? { storeId } : {}),
  };
}

/**
 * Reads a Vercel Blob URL for an authenticated application route.
 * Public blobs are fetched directly; private/generic Blob URLs are read with
 * the server-side Blob SDK so their authorization token never reaches users.
 */
export async function fetchStoredBlob(url: string): Promise<Response | null> {
  if (!isPrivateBlobUrl(url)) {
    return fetch(url, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(BLOB_READ_TIMEOUT_MS),
    }).catch(() => null);
  }

  try {
    const result = await get(url, {
      access: "private",
      ...readBlobCredentials(),
      abortSignal: AbortSignal.timeout(BLOB_READ_TIMEOUT_MS),
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;

    const responseHeaders = new Headers();
    result.headers.forEach((value, key) => responseHeaders.set(key, value));
    return new Response(result.stream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return null;
  }
}
