"use client";

import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { uploadMaintenanceMedia } from "@/lib/mediaUpload";
import { type QueuedMedia } from "@/lib/offlineQueue";
import { compressImage } from "@/lib/imageCompression";
import type { ReportAttachment } from "@/lib/types";
import type { VideoItem } from "../_types";
import { makeOfflineId, withTimeout } from "../_lib/recordMedia";

interface UseRecordEditMediaOptions {
  initialPhotos: string[];
  initialVideos: VideoItem[];
  initialReportAttachments: ReportAttachment[];
}

export interface UseRecordEditMediaResult {
  photos: string[];
  videos: VideoItem[];
  reportAttachments: ReportAttachment[];
  offlineMedia: QueuedMedia[];
  offlinePreviews: Record<string, string>;
  transientPhotoUrls: Set<string>;
  reportAttachmentBusy: boolean;
  mediaBusy: boolean;
  setPhotos: Dispatch<SetStateAction<string[]>>;
  setVideos: Dispatch<SetStateAction<VideoItem[]>>;
  setReportAttachments: Dispatch<SetStateAction<ReportAttachment[]>>;
  setReportAttachmentBusy: Dispatch<SetStateAction<boolean>>;
  addPhotos: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  addVideos: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  removePhoto: (index: number) => void;
  removeVideo: (index: number) => void;
  handleOfflineReportFile: (file: File, attachment: ReportAttachment) => void;
  removeReportAttachment: (attachment: ReportAttachment) => void;
}

export function useRecordEditMedia({
  initialPhotos,
  initialVideos,
  initialReportAttachments,
}: UseRecordEditMediaOptions): UseRecordEditMediaResult {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [transientPhotoUrls, setTransientPhotoUrls] = useState<Set<string>>(() => new Set());
  const [reportAttachments, setReportAttachments] = useState<ReportAttachment[]>(initialReportAttachments);
  const [reportAttachmentBusy, setReportAttachmentBusy] = useState(false);
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState<Record<string, string>>({});
  const [mediaBusy, setMediaBusy] = useState(false);
  const previewUrlsRef = useRef<Record<string, string>>({});

  function createOfflinePreview(id: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    previewUrlsRef.current[id] = url;
    setOfflinePreviews((current) => ({ ...current, [id]: url }));
    return url;
  }

  function revokeOfflinePreview(id: string): void {
    const url = previewUrlsRef.current[id];
    if (url) URL.revokeObjectURL(url);
    delete previewUrlsRef.current[id];
    setOfflinePreviews((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  useEffect(() => () => {
    Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = {};
  }, []);

  function removePhoto(index: number): void {
    const photo = photos[index];
    const id = photo?.startsWith("offline:") ? photo.slice("offline:".length) : "";
    if (id) {
      revokeOfflinePreview(id);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
    }
    if (photo && (photo.startsWith("http://") || photo.startsWith("https://"))) {
      setTransientPhotoUrls((current) => {
        if (!current.has(photo)) return current;
        const next = new Set(current);
        next.delete(photo);
        return next;
      });
    }
    setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function removeVideo(index: number): void {
    const video = videos[index];
    const url = typeof video === "string" ? video : video?.url;
    const id = url?.startsWith("offline:") ? url.slice("offline:".length) : "";
    if (id) {
      revokeOfflinePreview(id);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
    }
    setVideos((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleOfflineReportFile(file: File, attachment: ReportAttachment): void {
    const id = attachment.url.startsWith("offline:") ? attachment.url.slice("offline:".length) : makeOfflineId();
    setOfflineMedia((current) => [...current, { id, kind: "report", name: attachment.filename, type: attachment.mime, blob: file }]);
    createOfflinePreview(id, file);
  }

  function removeReportAttachment(attachment: ReportAttachment): void {
    if (!attachment.url.startsWith("offline:")) return;
    const id = attachment.url.slice("offline:".length);
    revokeOfflinePreview(id);
    setOfflineMedia((current) => current.filter((media) => media.id !== id));
  }

  async function addPhotos(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files || []);
    if (!files.length || mediaBusy) {
      event.target.value = "";
      return;
    }
    setMediaBusy(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        try {
          const compressed = await compressImage(file);
          const photoName = `${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "photo", name: photoName, type: "image/jpeg", blob: compressed }]);
            createOfflinePreview(id, compressed);
            uploaded.push(`offline:${id}`);
            continue;
          }
          const url = await withTimeout(
            uploadMaintenanceMedia(
              new File([compressed], photoName, { type: "image/jpeg" }),
              "photo",
            ),
            150_000,
            "Fotoğraf yükleme zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin.",
          );
          uploaded.push(url);
        } catch (error) {
          if (!navigator.onLine) {
            try {
              const compressed = await compressImage(file);
              const id = makeOfflineId();
              const photoName = `${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
              setOfflineMedia((current) => [...current, { id, kind: "photo", name: photoName, type: "image/jpeg", blob: compressed }]);
              createOfflinePreview(id, compressed);
              uploaded.push(`offline:${id}`);
              continue;
            } catch {
              // Genel hata aşağıda gösterilir.
            }
          }
          const message = error instanceof Error ? error.message : "Bilinmeyen hata";
          toast.error(`${file.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setTransientPhotoUrls((current) => {
        const next = new Set(current);
        uploaded.filter((url) => url.startsWith("http://") || url.startsWith("https://")).forEach((url) => next.add(url));
        return next;
      });
      setPhotos((current) => [...current, ...uploaded]);
      setMediaBusy(false);
      event.target.value = "";
    }
  }

  async function addVideos(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files || []);
    if (!files.length || mediaBusy) {
      event.target.value = "";
      return;
    }
    setMediaBusy(true);
    try {
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`'${file.name}' çok büyük (en fazla 100MB).`);
          continue;
        }
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "video", name: file.name, type: file.type || "video/mp4", blob: file }]);
          createOfflinePreview(id, file);
          setVideos((current) => [...current, { url: `offline:${id}`, filename: file.name, mime: file.type || "video/mp4" }]);
          continue;
        }
        try {
          const url = await withTimeout(
            uploadVideoChunked(file.type ? file : new File([file], file.name, { type: "video/mp4", lastModified: file.lastModified })),
            600_000,
            "Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.",
          );
          setVideos((current) => [...current, { url, filename: file.name, mime: file.type || "video/mp4" }]);
        } catch (error: unknown) {
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "video", name: file.name, type: file.type || "video/mp4", blob: file }]);
            createOfflinePreview(id, file);
            setVideos((current) => [...current, { url: `offline:${id}`, filename: file.name, mime: file.type || "video/mp4" }]);
            continue;
          }
          const message = error instanceof Error ? error.message.slice(0, 100) : "bilinmeyen hata";
          toast.error(`${file.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setMediaBusy(false);
      event.target.value = "";
    }
  }

  return {
    photos,
    videos,
    reportAttachments,
    offlineMedia,
    offlinePreviews,
    transientPhotoUrls,
    reportAttachmentBusy,
    mediaBusy,
    setPhotos,
    setVideos,
    setReportAttachments,
    setReportAttachmentBusy,
    addPhotos,
    addVideos,
    removePhoto,
    removeVideo,
    handleOfflineReportFile,
    removeReportAttachment,
  };
}
