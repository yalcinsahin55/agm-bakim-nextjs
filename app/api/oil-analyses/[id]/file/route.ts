import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "-").trim();
  return cleaned || "analiz.pdf";
}

function decodePdfData(value: string): Uint8Array | null {
  const base64 = value.replace(/^data:application\/pdf;base64,/i, "").trim();
  if (!base64) return null;
  try {
    return new Uint8Array(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, db.collection("users") as any);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Geçersiz analiz kaydı." }, { status: 400 });
    }

    const doc = await (db.collection("oil_analyses") as any).findOne(
      { _id: new ObjectId(params.id) },
      { projection: { pdf_url: 1, pdf_b64: 1, pdf_filename: 1 } },
    );
    if (!doc) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

    let bytes: Uint8Array | null = null;
    if (typeof doc.pdf_url === "string" && /^https:\/\//i.test(doc.pdf_url)) {
      const upstream = await fetch(doc.pdf_url, { cache: "no-store" });
      if (!upstream.ok) return NextResponse.json({ error: "Blob PDF dosyası okunamadı." }, { status: 502 });
      bytes = new Uint8Array(await upstream.arrayBuffer());
    } else if (typeof doc.pdf_b64 === "string") {
      bytes = decodePdfData(doc.pdf_b64);
    }

    if (!bytes || bytes.length === 0) {
      return NextResponse.json({ error: "PDF verisi bulunamadı veya bozuk." }, { status: 404 });
    }

    const filename = safeFilename(doc.pdf_filename || "analiz.pdf");
    const download = new URL(req.url).searchParams.get("download") === "1";
    const responseBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PDF sunma hatası:", error);
    return NextResponse.json({ error: "PDF görüntülenirken bir hata oluştu." }, { status: 500 });
  }
}
