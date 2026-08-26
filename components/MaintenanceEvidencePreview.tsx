"use client";

import NextImage from "next/image";
import type { VideoRef } from "@/lib/types";

function getPhotoSrc(photo: string, previews: Record<string, string> = {}): string {
  if (photo.startsWith("offline:")) return previews[photo.slice("offline:".length)] || "";
  // Yeni kayıt henüz MongoDB’ye yazılmadığı için medya proxy’si URL’yi bulamaz.
  // Form içindeki geçici upload’lar doğrudan trusted Blob URL’sinden gösterilir.
  return photo.startsWith("http://") || photo.startsWith("https://")
    ? photo
    : photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}`;
}

interface MaintenanceEvidencePreviewProps {
  photos: string[];
  videos: VideoRef[];
  offlinePreviews: Record<string, string>;
  onPhotoClick: (src: string) => void;
  onRemovePhoto: (index: number) => void;
  onRemoveVideo: (index: number) => void;
}

export default function MaintenanceEvidencePreview({
  photos,
  videos,
  offlinePreviews,
  onPhotoClick,
  onRemovePhoto,
  onRemoveVideo,
}: MaintenanceEvidencePreviewProps) {
  return (
    <>
      {photos.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-faint">Fotoğraflar</div>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <div key={`${photo}-${index}`} className="relative">
                <button type="button" onClick={() => onPhotoClick(getPhotoSrc(photo, offlinePreviews))} className="block" aria-label="Fotoğrafı büyüt">
                  <NextImage src={getPhotoSrc(photo, offlinePreviews)} width={64} height={64} unoptimized className="h-16 w-16 rounded-lg border border-border object-cover" alt="" />
                </button>
                <button type="button" onClick={() => onRemovePhoto(index)} className="absolute -right-1.5 -top-1.5 h-[18px] w-[18px] rounded-full border border-border bg-panel2 text-[10px] leading-none text-text" aria-label={`Fotoğraf ${index + 1} sil`}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-faint">Videolar</div>
          <div className="flex flex-wrap gap-2">
            {videos.map((video, index) => (
              <div key={`${video.url}-${index}`} className="relative">
                <video src={video.url?.startsWith("offline:") ? offlinePreviews[video.url.slice("offline:".length)] : video.url || undefined} className="h-16 w-20 rounded-lg border border-border bg-black object-cover" controls={false} />
                <button type="button" onClick={() => onRemoveVideo(index)} className="absolute -right-1.5 -top-1.5 h-[18px] w-[18px] rounded-full border border-border bg-panel2 text-[10px] leading-none text-red" aria-label={`Video ${index + 1} sil`}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export type { MaintenanceEvidencePreviewProps };
