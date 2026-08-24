import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxPhotoSize = 4 * 1024 * 1024;
const maxPdfSize = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(request, "blob-upload", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

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
    if ((folder === "oil-analyses" && file.type !== "application/pdf") || (folder === "photos" && file.type === "application/pdf")) {
      return NextResponse.json({ error: folder === "oil-analyses" ? "Yağ analizi klasörüne yalnızca PDF yüklenebilir." : "Fotoğraf klasörüne yalnızca görsel yüklenebilir." }, { status: 415 });
    }
    if (!canWriteMaintenance(user.role)) {
      return NextResponse.json({ error: "Bu hesap dosya yükleyemez." }, { status: 403 });
    }
    if (file.type === "application/pdf" && file.size > maxPdfSize) {
      return NextResponse.json({ error: "PDF dosyası 10 MB’tan küçük olmalıdır." }, { status: 413 });
    }
    if (file.type !== "application/pdf" && file.size > maxPhotoSize) {
      return NextResponse.json({ error: "Fotoğraf 4 MB’tan küçük olmalıdır." }, { status: 413 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    // Vercel Production’da bağlı Blob mağazası OIDC ile otomatik yetkilendirilir.
    // Yerel çalıştırmada ise BLOB_READ_WRITE_TOKEN kullanılabilir.
    const token = process.env.VERCEL ? undefined : (process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN);
    const blob = await put(`${folder}/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      ...(token ? { token } : {}),
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Sunucu dosya yükleme hatası:", error);
    return NextResponse.json({ error: "Blob depolama isteği başarısız oldu. Vercel Production Blob token’ını kontrol edin." }, { status: 502 });
  }
}
