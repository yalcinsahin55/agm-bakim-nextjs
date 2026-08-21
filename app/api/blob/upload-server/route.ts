import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(request, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    if (!allowedContentTypes.has(file.type)) return NextResponse.json({ error: "Desteklenmeyen fotoğraf türü." }, { status: 415 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Fotoğraf 4 MB’tan küçük olmalıdır." }, { status: 413 });

    const token = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return NextResponse.json({ error: "Blob depolama yapılandırılmamış." }, { status: 503 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`photos/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      token,
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Sunucu fotoğraf yükleme hatası:", error);
    return NextResponse.json({ error: "Fotoğraf Blob’a yüklenemedi." }, { status: 502 });
  }
}
