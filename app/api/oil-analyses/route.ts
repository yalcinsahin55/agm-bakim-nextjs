import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const engineId = searchParams.get("engine_id");
    const query = engineId ? { engine_id: engineId } : {};

    const analyses = await (db.collection("oil_analyses") as any)
      .find(query, { projection: { pdf_b64: 0 } })
      .sort({ analysis_date: -1 })
      .toArray();
    return NextResponse.json(analyses);
  } catch (error) {
    console.error("Yağ analizleri getirilirken hata:", error);
    return NextResponse.json({ error: "Yağ analizleri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!canWriteMaintenance(user.role)) return NextResponse.json({ error: "Bu hesap yağ analizi ekleyemez." }, { status: 403 });

    const { engine_id, analysis_date, result, note, pdf_url, pdf_b64, pdf_filename } = await req.json();
    if (!engine_id || (!pdf_url && !pdf_b64)) {
      return NextResponse.json({ error: "Motor ve PDF dosyası gerekli." }, { status: 400 });
    }
    if (pdf_url && typeof pdf_url !== "string") {
      return NextResponse.json({ error: "Geçersiz PDF bağlantısı." }, { status: 400 });
    }
    if (pdf_b64 && (typeof pdf_b64 !== "string" || pdf_b64.length > 10 * 1024 * 1024 * 1.4)) {
      return NextResponse.json({ error: "Dosya 10MB sınırını aşıyor." }, { status: 400 });
    }
    if (pdf_b64 && !pdf_b64.startsWith("data:application/pdf;base64,")) {
      return NextResponse.json({ error: "Geçersiz PDF formatı." }, { status: 400 });
    }

    const engine = await (db.collection("engines") as any).findOne({ _id: engine_id });
    if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

    const doc: Record<string, unknown> = {
      engine_id,
      engine_name: engine.name,
      analysis_date: analysis_date ? new Date(analysis_date) : new Date(),
      result: result || "İyi",
      note: note || "",
      pdf_filename: pdf_filename || "analiz.pdf",
      uploaded_by: user.full_name,
      uploaded_by_id: user._id,
      created_at: new Date(),
    };
    if (pdf_url) doc.pdf_url = pdf_url;
    else doc.pdf_b64 = pdf_b64;
    const res = await (db.collection("oil_analyses") as any).insertOne(doc);
    return NextResponse.json({ ok: true, id: res.insertedId });
  } catch (error) {
    console.error("Yağ analizi eklenirken hata:", error);
    return NextResponse.json({ error: "Yağ analizi eklenirken bir hata oluştu." }, { status: 500 });
  }
}
