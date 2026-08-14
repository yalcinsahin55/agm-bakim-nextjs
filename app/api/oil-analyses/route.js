import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const engineId = searchParams.get("engine_id");
  const query = engineId ? { engine_id: engineId } : {};

  const analyses = await db.collection("oil_analyses").find(query).sort({ analysis_date: -1 }).toArray();
  return NextResponse.json(analyses);
}

export async function POST(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role === "goruntuleyici") return NextResponse.json({ error: "Görüntüleyici rolü rapor ekleyemez." }, { status: 403 });

  const { engine_id, analysis_date, result, note, pdf_b64, pdf_filename } = await req.json();
  if (!engine_id || !pdf_b64) {
    return NextResponse.json({ error: "Motor ve PDF dosyası gerekli." }, { status: 400 });
  }
  // base64 boyutu ~ dosya boyutu * 4/3; 10MB sınırı
  if (pdf_b64.length > 10 * 1024 * 1024 * 1.4) {
    return NextResponse.json({ error: "Dosya 10MB sınırını aşıyor." }, { status: 400 });
  }

  const engine = await db.collection("engines").findOne({ _id: engine_id });
  if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

  const doc = {
    engine_id, engine_name: engine.name,
    analysis_date: analysis_date ? new Date(analysis_date) : new Date(),
    result: result || "İyi", note: note || "", pdf_b64, pdf_filename: pdf_filename || "analiz.pdf",
    uploaded_by: user.full_name, uploaded_by_id: user._id, created_at: new Date(),
  };
  const res = await db.collection("oil_analyses").insertOne(doc);
  return NextResponse.json({ ok: true, id: res.insertedId });
}
