import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  // 🔒 Sadece giriş yapmış kullanıcılar yükleyebilir
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: [
          "video/mp4",
          "video/webm",
          "video/quicktime",
          "video/x-msvideo",
          "video/3gpp",
        ],
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("Video yüklendi:", blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Upload hatası:", error);
    return NextResponse.json({ error: "Yükleme hatası: " + (error.message || "bilinmeyen") }, { status: 400 });
  }
}
