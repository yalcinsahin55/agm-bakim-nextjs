import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxPhotoSize = 4 * 1024 * 1024;
const maxPdfSize = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(request, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = formData.get("folder") === "oil-analyses" ? "oil-analyses" : "photos";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }
    if (!allowedContentTypes.has(file.type)) {
      return NextResponse.json({ error: "Desteklenmeyen dosya türü." }, { status: 415 });
    }
    if (folder === "oil-analyses" && user.role === "goruntuleyici") {
      return NextResponse.json({ error: "Bu hesap PDF yükleyemez." }, { status: 403 });
    }
    if (file.type === "application/pdf" && file.size > maxPdfSize) {
      return NextResponse.json({ error: "PDF dosyası 10 MB’tan küçük olmalıdır." }, { status: 413 });
    }
    if (file.type !== "application/pdf" && file.size > maxPhotoSize) {
      return NextResponse.json({ error: "Fotoğraf 4 MB’tan küçük olmalıdır." }, { status: 413 });
    }

    // Vercel Blob entegrasyonunun güncel değişkeni önceliklidir; eski özel isim geriye dönük desteklenir.
    const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN;
    if (!token) return NextResponse.json({ error: "Blob depolama yapılandırılmamış." }, { status: 503 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`${folder}/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      token,
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Sunucu dosya yükleme hatası:", error);
    return NextResponse.json({ error: "Blob depolama isteği başarısız oldu. Vercel Production Blob token’ını kontrol edin." }, { status: 502 });
  }
}
