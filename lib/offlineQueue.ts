"use client";

import { uploadVideoChunked } from "@/lib/chunkUpload";

const DB_NAME = "agm-bakim-offline";
const DB_VERSION = 1;
const STORE_NAME = "records";
const OFFLINE_PREFIX = "offline:";

export interface QueuedMedia {
  id: string;
  kind: "photo" | "video";
  name: string;
  type: string;
  blob: Blob;
}

export interface QueuedRecordJob {
  id: string;
  createdAt: string;
  method: "POST" | "PATCH";
  endpoint: string;
  payload: Record<string, unknown>;
  media: QueuedMedia[];
  retryCount: number;
  lastError?: string;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Bu tarayıcı çevrimdışı kayıtları desteklemiyor."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Çevrimdışı kayıt deposu açılamadı."));
  });
}

function dispatchChanged(remaining?: number): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue:changed", { detail: { remaining } }));
  }
}

async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (sync) await sync.register("agm-offline-sync");
  } catch {
    // Background Sync desteklenmiyorsa online olayı ve uygulama açılışı yeterlidir.
  }
}

export function isOfflinePlaceholder(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(OFFLINE_PREFIX);
}

let activeSync: Promise<{ synced: number; remaining: number; error?: string }> | null = null;

export async function queueRecord(
  payload: Record<string, unknown>,
  media: QueuedMedia[],
  options: { method?: "POST" | "PATCH"; endpoint?: string } = {},
): Promise<string> {
  const database = await openDatabase();
  const id = makeId();
  const jobPayload = { ...payload, client_request_id: id };
  const job: QueuedRecordJob = {
    id,
    createdAt: new Date().toISOString(),
    method: options.method || "POST",
    endpoint: options.endpoint || "/api/records",
    payload: jobPayload,
    media,
    retryCount: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(job);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Çevrimdışı kayıt saklanamadı."));
  });
  database.close();
  void getPendingOfflineCount().then((remaining) => dispatchChanged(remaining)).catch(() => dispatchChanged());
  void requestBackgroundSync();
  return id;
}

export async function listQueuedRecords(): Promise<QueuedRecordJob[]> {
  const database = await openDatabase();
  const jobs = await new Promise<QueuedRecordJob[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as QueuedRecordJob[]);
    request.onerror = () => reject(request.error || new Error("Çevrimdışı kayıtlar okunamadı."));
  });
  database.close();
  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getPendingOfflineCount(): Promise<number> {
  return (await listQueuedRecords()).length;
}

async function removeQueuedRecord(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Çevrimdışı kayıt silinemedi."));
  });
  database.close();
}

async function updateQueuedRecord(job: QueuedRecordJob): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(job);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Çevrimdışı kayıt güncellenemedi."));
  });
  database.close();
}

async function uploadPhoto(blob: Blob, name: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", new File([blob], name, { type: "image/jpeg" }));
  formData.append("folder", "photos");
  const response = await fetch("/api/blob/upload-server", { method: "POST", body: formData });
  const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error || "Fotoğraf yüklenemedi.");
  return data.url;
}

function replacePhotoPlaceholder(photos: unknown, id: string, url: string): unknown[] {
  return Array.isArray(photos) ? photos.map((photo) => photo === `${OFFLINE_PREFIX}${id}` ? url : photo) : [];
}

function replaceVideoPlaceholder(videos: unknown, id: string, url: string): unknown[] {
  return Array.isArray(videos) ? videos.map((video) => {
    if (!video || typeof video !== "object") return video;
    const item = video as Record<string, unknown>;
    return item.url === `${OFFLINE_PREFIX}${id}` ? { ...item, url } : video;
  }) : [];
}

async function runOfflineSync(): Promise<{ synced: number; remaining: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, remaining: await getPendingOfflineCount(), error: "İnternet bağlantısı yok." };
  }

  const jobs = await listQueuedRecords();
  let synced = 0;
  let lastError: string | undefined;
  for (const originalJob of jobs) {
    const job: QueuedRecordJob = {
      ...originalJob,
      payload: { ...originalJob.payload, client_request_id: originalJob.payload.client_request_id || originalJob.id },
      media: [...originalJob.media],
    };
    try {
      for (const media of job.media) {
        const storedBlob = media.blob;
        const placeholder = `${OFFLINE_PREFIX}${media.id}`;
        if (media.kind === "photo") {
          const pending = Array.isArray(job.payload.photos) && job.payload.photos.includes(placeholder);
          if (!pending) continue;
          const url = await uploadPhoto(storedBlob, media.name);
          job.payload.photos = replacePhotoPlaceholder(job.payload.photos, media.id, url);
        } else {
          const pending = Array.isArray(job.payload.videos) && job.payload.videos.some((video) => video && typeof video === "object" && (video as Record<string, unknown>).url === placeholder);
          if (!pending) continue;
          const url = await uploadVideoChunked(new File([storedBlob], media.name, { type: media.type || "video/mp4" }));
          job.payload.videos = replaceVideoPlaceholder(job.payload.videos, media.id, url);
        }
      }

      const response = await fetch(job.endpoint, {
        method: job.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job.payload),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || `Kayıt gönderilemedi (HTTP ${response.status}).`);
      await removeQueuedRecord(job.id);
      synced += 1;
      const remaining = await getPendingOfflineCount();
      dispatchChanged(remaining);
    } catch (error) {
      job.retryCount += 1;
      job.lastError = error instanceof Error ? error.message : "Bilinmeyen senkronizasyon hatası.";
      await updateQueuedRecord(job);
      lastError = job.lastError;
      void getPendingOfflineCount().then((remaining) => dispatchChanged(remaining)).catch(() => dispatchChanged());
      break;
    }
  }

  const remaining = await getPendingOfflineCount();
  dispatchChanged(remaining);
  if (synced > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications:refresh"));
  }
  return { synced, remaining, error: lastError };
}

export function syncOfflineQueue(): Promise<{ synced: number; remaining: number; error?: string }> {
  if (!activeSync) activeSync = runOfflineSync().finally(() => { activeSync = null; });
  return activeSync;
}
