import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { usersCollection } from "@/lib/dbCollections";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { withApiTiming } from "@/lib/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOGO_SIZE = 1_500_000;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);

async function postLogo(request: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") return NextResponse.json({ error: "Özel rapor logosunu yalnızca yöneticiler yükleyebilir." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(request, "assistant-logo", 12, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Logo dosyası bulunamadı." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Logo yalnızca PNG veya JPEG olabilir." }, { status: 415 });
    if (file.size === 0 || file.size > MAX_LOGO_SIZE) return NextResponse.json({ error: "Logo dosyası 1,5 MB’tan küçük ve boş olmayan bir dosya olmalıdır." }, { status: 413 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "logo";
    const token = process.env.VERCEL ? undefined : (process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN);
    const blob = await put(`assistant-report-logos/${user._id}/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      ...(token ? { token } : {}),
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (error) {
    console.error("Asistan export logo yükleme hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Logo depolama isteği başarısız oldu." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  return withApiTiming("POST /api/assistant/export-logo", () => postLogo(request), { request });
}
