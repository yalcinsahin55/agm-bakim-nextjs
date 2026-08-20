import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 🩺 TEŞHİS: Tarayıcıda bu adresi açınca sistemin durumunu gösterir
export async function GET(req) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  return NextResponse.json({
    ok: true,
    tokenSet: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    loggedIn: Boolean(user),
  });
}

export async function POST(req) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN tanımlı değil! Vercel ortam değişkeni eksik." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({}),
      onUploadCompleted: async ({ blob }) => {
        console.log("Video yüklendi:", blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Upload hatası:", error);
    return NextResponse.json(
      { error: "Yükleme hatası: " + (error.message || "bilinmeyen") },
      { status: 400 }
    );
  }
}
