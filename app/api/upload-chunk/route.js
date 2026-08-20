import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FALLBACK_BLOB_TOKEN = "vercel_blob_rw_QYyuJntX1bdYnage_oywzsJRuVR4YSGoe0rmCORIyTXrxgl";
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  process.env.BLOB_READ_WRITE_TOKEN = FALLBACK_BLOB_TOKEN;
}

export async function POST(req) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users"));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const body = await req.json();
  const col = db.collection("video_chunks");

  // Parça kaydet
  if (!body.finalize) {
    const { upload_id, index, chunk_b64 } = body;
    if (!upload_id || typeof index !== "number" || !chunk_b64) {
      return NextResponse.json({ error: "Eksik parça verisi" }, { status: 400 });
    }
    await col.updateOne(
      { upload_id, index },
      { $set: { chunk_b64, at: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  }

  // Birleştir ve Blob'a yaz
  const { upload_id, filename, mime, total } = body;
  const chunks = await col.find({ upload_id }).sort({ index: 1 }).toArray();
  if (chunks.length !== total) {
    return NextResponse.json({ error: "Parçalar eksik, tekrar deneyin" }, { status: 400 });
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c.chunk_b64, "base64")));
  const safeName = `${Date.now()}-${(filename || "video.mp4").replace(/[^\w.\-]+/g, "_")}`;

  const blob = await put(`videos/${safeName}`, buffer, {
    access: "public",
    contentType: mime || "video/mp4",
  });

  await col.deleteMany({ upload_id });
  return NextResponse.json({ ok: true, url: blob.url });
}
