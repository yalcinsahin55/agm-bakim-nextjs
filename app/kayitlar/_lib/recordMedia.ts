import { getMediaDisplayUrl } from "@/lib/mediaUrls";
import { formatDateTimeLocal } from "@/lib/maintenanceTime";
import type { VideoItem } from "../_types";

export function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

export function getPhotoSrc(photo: string, previews: Record<string, string> = {}, transientUrls?: ReadonlySet<string>): string {
  if (photo.startsWith("offline:")) return previews[photo.slice("offline:".length)] || "";
  if (photo.startsWith("http://") || photo.startsWith("https://")) {
    // Yeni yüklenen URL henüz kayda yazılmadı; proxy bunu doğal olarak bulamaz.
    return transientUrls?.has(photo) ? photo : getMediaDisplayUrl(photo, "image");
  }
  return photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}`;
}

export function makeOfflineId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getVideoSrc(v: VideoItem | string, previews: Record<string, string> = {}, transientUrls?: ReadonlySet<string>): string {
  const url = typeof v === "string" ? v : v?.url;
  if (url?.startsWith("offline:")) return previews[url.slice("offline:".length)] || "";
  if (url) return transientUrls?.has(url) ? url : getMediaDisplayUrl(url, "video");
  if (typeof v !== "string" && v?.data_b64) return `data:${v.mime || "video/mp4"};base64,${v.data_b64}`;
  return "";
}

export function toLocalDateTimeInput(value: string | Date | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatDateTimeLocal(date) : "";
}


