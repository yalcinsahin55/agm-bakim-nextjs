import { uploadMaintenanceMedia, type MaintenanceMediaUploadOptions } from "@/lib/mediaUpload";

export async function uploadVideoChunked(
  file: File,
  options: MaintenanceMediaUploadOptions = {},
): Promise<string> {
  return uploadMaintenanceMedia(file, "video", options);
}
