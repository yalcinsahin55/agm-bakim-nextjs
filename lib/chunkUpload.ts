import { uploadMaintenanceMedia } from "@/lib/mediaUpload";

export async function uploadVideoChunked(file: File): Promise<string> {
  return uploadMaintenanceMedia(file, "video");
}
