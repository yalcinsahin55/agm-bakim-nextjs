import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { withApiTiming } from "@/lib/performance";
import { fetchStoredBlob } from "@/lib/blobStorage";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { ensureAppIndexes } from "@/lib/dbIndexes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUSTED_BLOB_SUFFIXES = [
  ".public.blob.vercel-storage.com",
  ".private.blob.vercel-storage.com",
  ".blob.vercel-storage.com",
] as const;

type MediaKind = "image" | "video";

function isTrustedMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.pathname) return false;
    const hostname = url.hostname.toLowerCase();
    return TRUSTED_BLOB_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function isMediaKind(value: string | null): value is MediaKind {
  return value === "image" || value === "video";
}

function mediaContentTypeMatches(kind: MediaKind, contentType: string | null): boolean {
  if (!contentType) return false;
  return kind === "image" ? contentType.toLowerCase().startsWith("image/") : contentType.toLowerCase().startsWith("video/");
}

async function getMedia(request: NextRequest): Promise<Response> {
  const db = await getDb();
  const user = await getCurrentUser(request, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(request, "media-read", 240, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const url = request.nextUrl.searchParams.get("url") || "";
  const kind = request.nextUrl.searchParams.get("kind");
  if (!isMediaKind(kind) || !isTrustedMediaUrl(url)) {
    return NextResponse.json({ error: "Geçersiz medya URL’si." }, { status: 400 });
  }
  await ensureAppIndexes(db);

  // Ham, tahmin edilmiş bir Blob URL’si tek başına erişim kanıtı değildir.
  // URL’nin bu uygulamadaki bir bakım kaydına ait olduğunu doğrula; böylece
  // giriş yapmış bir kullanıcı bağlı olmayan Blob nesnelerini proxy’leyemez.
  const mediaReference = await recordsCollection(db).findOne(
    kind === "image"
      ? { photos: url }
      : { $or: [{ videos: url }, { "videos.url": url }] },
    { projection: { _id: 1 } },
  );
  if (!mediaReference) {
    return NextResponse.json({ error: "Medya kaydı bulunamadı." }, { status: 404 });
  }

  const stored = await fetchStoredBlob(url);
  if (!stored || !stored.ok) {
    return NextResponse.json({ error: "Medya depolamadan okunamadı." }, { status: 502 });
  }

  const contentType = stored.headers.get("content-type");
  if (!mediaContentTypeMatches(kind, contentType)) {
    return NextResponse.json({ error: "Medya türü doğrulanamadı." }, { status: 415 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  });
  const contentLength = stored.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  return new Response(stored.body, { status: 200, headers });
}

export async function GET(request: NextRequest) {
  return withApiTiming("GET /api/media/file", () => getMedia(request), { request });
}
