const MAX_LEGACY_MEDIA_BYTES = 8 * 1024 * 1024;

function base64Bytes(value: string): number {
  const body = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  return Math.floor((body.length * 3) / 4) - (body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0);
}

export function getLegacyMediaBytes(photosB64: unknown, videos: unknown): number {
  let total = 0;
  if (Array.isArray(photosB64)) {
    for (const photo of photosB64) if (typeof photo === "string") total += Math.max(0, base64Bytes(photo));
  }
  if (Array.isArray(videos)) {
    for (const video of videos) {
      const value = typeof video === "string" ? video : video && typeof video === "object" ? (video as { data_b64?: unknown }).data_b64 : null;
      if (typeof value === "string") total += Math.max(0, base64Bytes(value));
    }
  }
  return total;
}

export function legacyMediaTooLarge(photosB64: unknown, videos: unknown): boolean {
  return getLegacyMediaBytes(photosB64, videos) > MAX_LEGACY_MEDIA_BYTES;
}

export const LEGACY_MEDIA_LIMIT_LABEL = "8 MB";
