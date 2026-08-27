"use client";

import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { uploadMaintenanceMedia } from "@/lib/mediaUpload";
import type { QueuedMedia } from "@/lib/offlineQueue";
import type { ReportAttachment, VideoRef } from "@/lib/types";
import { compressImage } from "@/lib/imageCompression";
import { makeOfflineId, withTimeout } from "../_lib/offlineHelpers";

export interface UseCompletionEvidenceMediaResult {
  photos: string[];
  videos: VideoRef[];
  reportAttachments: ReportAttachment[];
  offlineMedia: QueuedMedia[];
  offlinePreviews: Record<string, string>;
  photoBusy: boolean;
  videoBusy: boolean;
  reportAttachmentBusy: boolean;
  setReportAttachments: Dispatch<SetStateAction<ReportAttachment[]>>;
  setReportAttachmentBusy: Dispatch<SetStateAction<boolean>>;
  handlePhotos: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleVideos: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  removePhoto: (index: number) => void;
  removeVideo: (index: number) => void;
  handleOfflineReportFile: (file: File, attachment: ReportAttachment) => void;
  removeReportAttachment: (attachment: ReportAttachment) => void;
}

export function useCompletionEvidenceMedia(): UseCompletionEvidenceMediaResult {
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [videos, setVideos] = useState<VideoRef[]>([]);
  const [videoBusy, setVideoBusy] = useState(false);
  const [reportAttachments, setReportAttachments] = useState<ReportAttachment[]>([]);
  const [reportAttachmentBusy, setReportAttachmentBusy] = useState(false);
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState<Record<string, string>>({});
  const offlinePreviewUrlsRef = useRef<Record<string, string>>({});

  function createOfflinePreview(id: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    offlinePreviewUrlsRef.current[id] = url;
    setOfflinePreviews((current) => ({ ...current, [id]: url }));
    return url;
  }

  function revokeOfflinePreview(id: string): void {
    const url = offlinePreviewUrlsRef.current[id];
    if (url) URL.revokeObjectURL(url);
    delete offlinePreviewUrlsRef.current[id];
    setOfflinePreviews((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  useEffect(() => () => {
    Object.values(offlinePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    offlinePreviewUrlsRef.current = {};
  }, []);

  async function handlePhotos(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files || []);
    if (!files.length || photoBusy) {
      event.target.value = "";
      return;
    }
    setPhotoBusy(true);
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
              // Aşağıdaki genel hata kullanıcıya gösterilir.
            }
          }
          const message = error instanceof Error ? error.message : "Bilinmeyen hata";
          toast.error(`${file.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setPhotos((current) => [...current, ...uploaded]);
      setPhotoBusy(false);
      event.target.value = "";
    }
  }

  function removePhoto(index: number): void {
    const photo = photos[index];
    if (photo && photo.startsWith("offline:")) {
      const id = photo.slice("offline:".length);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
      revokeOfflinePreview(id);
    }
    setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleVideos(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files || []);
    if (!files.length || videoBusy) {
      event.target.value = "";
      return;
    }
    if (videos.length + files.length > 5) {
      toast.warning("Toplamda en fazla 5 video ekleyebilirsiniz.");
      event.target.value = "";
      return;
    }

    setVideoBusy(true);
    try {
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} çok büyük (en fazla 100MB).`);
          continue;
        }
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "video", name: file.name, type: file.type || "video/mp4", blob: file }]);
          createOfflinePreview(id, file);
          setVideos((current) => [...current, { url: `offline:${id}`, filename: file.name }]);
          continue;
        }
        try {
          const url = await withTimeout(
            uploadVideoChunked(file.type ? file : new File([file], file.name, { type: "video/mp4", lastModified: file.lastModified })),
            600_000,
            "Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.",
          );
          setVideos((current) => [...current, { url, filename: file.name }]);
        } catch (error: unknown) {
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "video", name: file.name, type: file.type || "video/mp4", blob: file }]);
            createOfflinePreview(id, file);
            setVideos((current) => [...current, { url: `offline:${id}`, filename: file.name }]);
            continue;
          }
          const message = error instanceof Error ? error.message.slice(0, 100) : "bilinmeyen hata";
          toast.error(`${file.name} yüklenemedi: ${message}`);
        }
      }
    } finally {
      setVideoBusy(false);
      event.target.value = "";
    }
  }

  function removeVideo(index: number): void {
    const video = videos[index];
    if (video?.url?.startsWith("offline:")) {
      const id = video.url.slice("offline:".length);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
      revokeOfflinePreview(id);
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
    setOfflineMedia((current) => current.filter((media) => media.id !== id));
    revokeOfflinePreview(id);
  }

  return {
    photos,
    videos,
    reportAttachments,
    offlineMedia,
    offlinePreviews,
    photoBusy,
    videoBusy,
    reportAttachmentBusy,
    setReportAttachments,
    setReportAttachmentBusy,
    handlePhotos,
    handleVideos,
    removePhoto,
    removeVideo,
    handleOfflineReportFile,
    removeReportAttachment,
  };
}
