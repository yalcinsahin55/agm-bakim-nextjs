import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Db } from "mongodb";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { withApiTiming } from "@/lib/performance";
import { usersCollection, videoChunksCollection } from "@/lib/dbCollections";
import { MAX_UPLOAD_CHUNK_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";
import { REPORT_ATTACHMENT_MAX_BYTES, REPORT_ATTACHMENT_MIME_TYPES, sanitizeReportAttachmentFilename } from "@/lib/reportAttachments";

export const dynamic = "force-dynamic";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_BASE64_LENGTH = 3_000_000;

type ValidatedChunk = { index: number; chunk_b64: string };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}
function isValidBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

async function validateChunks(db: Db, uploadId: string, ownerId: string, total: number, maxBytes: number): Promise<{ ok: true; totalBytes: number } | { ok: false }> {
  let expectedIndex = 0;
  let totalBytes = 0;
  const cursor = videoChunksCollection(db).find({ upload_id: uploadId, owner_id: ownerId }).sort({ index: 1 });
  for await (const chunk of cursor) {
    if (chunk.index !== expectedIndex || typeof chunk.chunk_b64 !== "string" || chunk.chunk_b64.length > MAX_CHUNK_BASE64_LENGTH || !isValidBase64(chunk.chunk_b64)) return { ok: false };
    const bytes = Buffer.from(chunk.chunk_b64, "base64");
    if (bytes.length === 0) return { ok: false };
    totalBytes += bytes.length;
    if (totalBytes > maxBytes) return { ok: false };
    expectedIndex += 1;
  }
  return expectedIndex === total && totalBytes > 0 ? { ok: true, totalBytes } : { ok: false };
}

async function postUploadChunk(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!canWriteMaintenance(user.role)) return NextResponse.json({ error: "Bu hesap dosya yükleyemez." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "video-upload", 600, 30 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  await ensureAppIndexes(db);

  const bodyResult = await parseJsonBodyLimited(req, MAX_UPLOAD_CHUNK_REQUEST_BYTES);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.tooLarge ? "Upload parçası isteği izin verilen boyutu aşıyor." : "Geçersiz upload isteği." }, { status: bodyResult.tooLarge ? 413 : 400 });
  const rawBody: unknown = bodyResult.value;
  if (!isObjectRecord(rawBody)) return NextResponse.json({ error: "Geçersiz upload isteği." }, { status: 400 });
  const body = rawBody;
  const col = videoChunksCollection(db);

  if (!body.finalize) {
    const { upload_id, index, chunk_b64, total, kind = "video" } = body;
    const isReport = kind === "report";
    if (typeof upload_id !== "string" || upload_id.length < 8 || upload_id.length > 160 || !/^[-\w]+$/.test(upload_id)
      || !isInteger(index) || index < 0 || index > 100 || (kind !== "video" && !isReport)
      || !isInteger(total) || total < 1 || total > (isReport ? 20 : 50)
      || typeof chunk_b64 !== "string" || chunk_b64.length === 0 || chunk_b64.length > MAX_CHUNK_BASE64_LENGTH || !isValidBase64(chunk_b64)) {
      return NextResponse.json({ error: "Eksik veya geçersiz parça verisi" }, { status: 400 });
    }
    if (index >= total) return NextResponse.json({ error: "Parça sırası toplam parça sayısını aşamaz." }, { status: 400 });
    await col.updateOne({ upload_id, owner_id: user._id, index }, { $set: { upload_id, owner_id: user._id, index, total, kind, chunk_b64, at: new Date() } }, { upsert: true });
    return NextResponse.json({ ok: true });
  }

  const { upload_id, filename, mime, total, kind = "video" } = body;
  const isReport = kind === "report";
  if (typeof upload_id !== "string" || upload_id.length < 8 || upload_id.length > 160 || !/^[-\w]+$/.test(upload_id)
    || !isInteger(total) || total < 1 || total > (isReport ? 20 : 50) || (kind !== "video" && !isReport)
    || typeof filename !== "string" || filename.length > 200 || typeof mime !== "string"
    || (isReport ? !(REPORT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime) : !/^video\/[a-z0-9.+-]+$/i.test(mime))) {
    return NextResponse.json({ error: isReport ? "Geçersiz rapor eki birleştirme verisi" : "Geçersiz video birleştirme verisi" }, { status: 400 });
  }

  const maxBytes = isReport ? REPORT_ATTACHMENT_MAX_BYTES : MAX_VIDEO_BYTES;
  const validation = await validateChunks(db, upload_id, user._id, total, maxBytes);
  if (!validation.ok) return NextResponse.json({ error: "Parçalar eksik veya geçersiz, tekrar deneyin" }, { status: 400 });
  if (validation.totalBytes > maxBytes) return NextResponse.json({ error: isReport ? "Rapor eki 20 MB’tan küçük olmalıdır." : "Video 100 MB’tan küçük olmalıdır." }, { status: 413 });

  const token = isReport ? (process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN) : (process.env.VERCEL ? undefined : (process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN));
  const safeName = isReport
    ? `${Date.now()}-${upload_id.slice(-12)}-${sanitizeReportAttachmentFilename(filename)}`
    : `${Date.now()}-${String(filename || "video.mp4").replace(/[^\w.\-]+/g, "_")}`;
  const stream = Readable.from((async function* (): AsyncGenerator<Buffer> {
    const cursor = col.find({ upload_id, owner_id: user._id }).sort({ index: 1 });
    for await (const chunk of cursor) yield Buffer.from((chunk as ValidatedChunk).chunk_b64, "base64");
  })());

  try {
    const blob = await put(`${isReport ? "report-attachments" : "videos"}/${safeName}`, stream, {
      access: isReport ? "private" : "public",
      multipart: true,
      contentType: mime,
      ...(token ? { token } : {}),
    });
    await col.deleteMany({ upload_id, owner_id: user._id });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (error) {
    console.error("Chunk Blob finalize hatası:", error instanceof Error ? error.message : "UnknownError");
    return NextResponse.json({ error: "Dosya Blob depolamasında birleştirilemedi. Lütfen tekrar deneyin." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/upload-chunk", () => postUploadChunk(req), { request: req });
}
