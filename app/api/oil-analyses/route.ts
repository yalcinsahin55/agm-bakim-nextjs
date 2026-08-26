import { enginesCollection, oilAnalysesCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isAllowedPdfUrl } from "@/lib/pdfSecurity";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { MAX_OIL_ANALYSIS_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";
import type { OilAnalysisDocument } from "@/lib/dbTypes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const engineId = searchParams.get("engine_id");
    const query = engineId ? { engine_id: engineId } : {};

    const analyses = await oilAnalysesCollection(db)
      .find(query, { projection: { pdf_b64: 0 } })
      .sort({ analysis_date: -1 })
      .toArray();
    return NextResponse.json(analyses);
  } catch (error) {
    console.error("Yağ analizleri getirilirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Yağ analizleri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
    const rateLimited = await enforceApiRateLimit(req, "oil-analysis-create", 30, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const bodyResult = await parseJsonBodyLimited(req, MAX_OIL_ANALYSIS_REQUEST_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.tooLarge ? "Yağ analizi isteği izin verilen boyutu aşıyor." : "Geçersiz yağ analizi verisi." },
        { status: bodyResult.tooLarge ? 413 : 400 },
      );
    }
    const body = bodyResult.value;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz yağ analizi verisi." }, { status: 400 });
    }
    const rawBody = body as Record<string, unknown>;
    const engine_id = typeof rawBody.engine_id === "string" ? rawBody.engine_id.trim() : "";
    const analysis_date = typeof rawBody.analysis_date === "string" ? rawBody.analysis_date : "";
    const result = typeof rawBody.result === "string" ? rawBody.result : "";
    const note = typeof rawBody.note === "string" ? rawBody.note : "";
    const pdf_url = typeof rawBody.pdf_url === "string" ? rawBody.pdf_url.trim() : "";
    const pdf_b64 = typeof rawBody.pdf_b64 === "string" ? rawBody.pdf_b64 : "";
    const pdf_filename = typeof rawBody.pdf_filename === "string" ? rawBody.pdf_filename.trim() : "";
    if (!engine_id || (!pdf_url && !pdf_b64)) {
      return NextResponse.json({ error: "Motor ve PDF dosyası gerekli." }, { status: 400 });
    }
    if (pdf_url && !isAllowedPdfUrl(pdf_url)) {
      return NextResponse.json({ error: "PDF bağlantısı izin verilen güvenli depolama alanından olmalıdır." }, { status: 400 });
    }
    if (pdf_b64 && pdf_b64.length > 10 * 1024 * 1024 * 1.4) {
      return NextResponse.json({ error: "Dosya 10MB sınırını aşıyor." }, { status: 400 });
    }
    if (pdf_b64 && !pdf_b64.startsWith("data:application/pdf;base64,")) {
      return NextResponse.json({ error: "Geçersiz PDF formatı." }, { status: 400 });
    }

    const engine = await enginesCollection(db).findOne({ _id: engine_id });
    if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

    const doc: OilAnalysisDocument = {
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
    const res = await oilAnalysesCollection(db).insertOne(doc);
    return NextResponse.json({ ok: true, id: res.insertedId });
  } catch (error) {
    console.error("Yağ analizi eklenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Yağ analizi eklenirken bir hata oluştu." }, { status: 500 });
  }
}
