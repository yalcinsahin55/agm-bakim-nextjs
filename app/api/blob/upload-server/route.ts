import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { withApiTiming } from "@/lib/performance";
import {
  REPORT_ATTACHMENT_MAX_BYTES,
  REPORT_ATTACHMENT_MAX_FILENAME_LENGTH,
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
} from "@/lib/reportAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoSize = 4 * 1024 * 1024;
const maxVideoSize = 100 * 1024 * 1024;
const maxPdfSize = 10 * 1024 * 1024;

function isReportAttachmentFolder(value: FormDataEntryValue | null): boolean {
  return value === "report-attachments";
}

async function postUpload(request: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(request, "blob-upload", 120, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folderValue = formData.get("folder");
    const folder = folderValue === "oil-analyses"
      ? "oil-analyses"
      : folderValue === "report-attachments"
        ? "report-attachments"
        : folderValue === "videos"
          ? "videos"
          : folderValue === "photos"
            ? "photos"
            : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }
    if (!canWriteMaintenance(user.role)) {
      return NextResponse.json({ error: "Bu hesap dosya yükleyemez." }, { status: 403 });
    }
    if (!folder) {
      return NextResponse.json({ error: "Geçersiz dosya klasörü." }, { status: 400 });
    }

    const resolvedReportMime = isReportAttachmentFolder(folderValue)
      ? resolveReportAttachmentMime(file.type, file.name)
      : null;
    if (isReportAttachmentFolder(folderValue)) {
      if (!resolvedReportMime) return NextResponse.json({ error: "Yalnızca PDF, Excel veya Word dosyaları yüklenebilir." }, { status: 415 });
      if (file.size <= 0 || file.size > REPORT_ATTACHMENT_MAX_BYTES) {
        return NextResponse.json({ error: "Rapor eki 20 MB’tan küçük olmalıdır." }, { status: 413 });
      }
    } else if (folder === "oil-analyses") {
      if (file.type !== "application/pdf") return NextResponse.json({ error: "Yağ analizi klasörüne yalnızca PDF yüklenebilir." }, { status: 415 });
      if (file.size <= 0 || file.size > maxPdfSize) return NextResponse.json({ error: "PDF dosyası 10 MB’tan küçük olmalıdır." }, { status: 413 });
    } else if (folder === "photos") {
      if (!imageContentTypes.has(file.type)) return NextResponse.json({ error: "Fotoğraf klasörüne yalnızca JPEG, PNG veya WebP görsel yüklenebilir." }, { status: 415 });
      if (file.size <= 0 || file.size > maxPhotoSize) return NextResponse.json({ error: "Fotoğraf 4 MB’tan küçük olmalıdır." }, { status: 413 });
    } else if (folder === "videos") {
      if (!file.type.startsWith("video/")) return NextResponse.json({ error: "Video klasörüne yalnızca video dosyaları yüklenebilir." }, { status: 415 });
      if (file.size <= 0 || file.size > maxVideoSize) return NextResponse.json({ error: "Video 100 MB’tan küçük olmalıdır." }, { status: 413 });
    }

    const safeName = isReportAttachmentFolder(folderValue)
      ? sanitizeReportAttachmentFilename(file.name).slice(0, REPORT_ATTACHMENT_MAX_FILENAME_LENGTH)
      : file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const rawIdempotencyKey = formData.get("idempotency_key");
    const idempotencyKey = typeof rawIdempotencyKey === "string"
      ? rawIdempotencyKey.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96)
      : "";
    const pathname = idempotencyKey
      ? `${folder}/offline-${idempotencyKey}-${safeName}`
      : `${folder}/${Date.now()}-${safeName}`;
    // Vercel Production’da Blob SDK, bağlı mağaza için OIDC yetkilendirmesini otomatik kullanır.
    // Manuel token/storeId yalnızca local veya Vercel dışı ortamlarda geçirilir.
    const token = process.env.VERCEL ? undefined : (process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN);
    const storeId = process.env.VERCEL ? undefined : (process.env.BLOB_STORE_ID || process.env.MEDIA_STORE_ID || undefined);
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: !idempotencyKey,
      ...(idempotencyKey ? { allowOverwrite: true } : {}),
      ...(token ? { token } : {}),
      ...(storeId ? { storeId } : {}),
    });
    return NextResponse.json({
      url: blob.url,
      ...(resolvedReportMime ? { filename: safeName, mime: resolvedReportMime, size: file.size } : {}),
    });
  } catch (error) {
    console.error("Sunucu dosya yükleme hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Blob depolama isteği başarısız oldu. Vercel Production Blob token’ını kontrol edin." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  return withApiTiming("POST /api/blob/upload-server", () => postUpload(request), { request });
}
