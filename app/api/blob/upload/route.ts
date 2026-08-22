import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = await getDb();
  const user = await getCurrentUser(request, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes,
        maximumSizeInBytes: 100 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user._id, pathname }),
      }),
      onUploadCompleted: async () => {
        // Dosyanın kayda bağlanması, bakım kaydı kaydedilirken URL ile yapılır.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Blob upload token hatası:", error);
    return NextResponse.json({ error: "Dosya yükleme yetkilendirmesi başarısız." }, { status: 500 });
  }
}
