// 🎬 Videoyu parça parça yükler (kütüphanesiz, garantili yöntem)
import { upload } from "@vercel/blob/client";

export async function uploadVideoChunked(file: File): Promise<string> {
  const blob = await upload(`videos/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    multipart: true,
  });
  return blob.url;
}
