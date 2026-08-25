const BLOB_HOST_SUFFIXES = [
  ".public.blob.vercel-storage.com",
  ".private.blob.vercel-storage.com",
  ".blob.vercel-storage.com",
] as const;

function isTrustedBlobHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return BLOB_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function getMediaDisplayUrl(value: string, kind: "image" | "video"): string {
  if (!value || value.startsWith("data:") || value.startsWith("offline:")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !isTrustedBlobHost(url.hostname)) return value;
    return `/api/media/file?kind=${kind}&url=${encodeURIComponent(value)}`;
  } catch {
    return value;
  }
}
