import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";


export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    // ✨ ÖNEMLİ DÜZELTME: Seed hatası verse bile sayfa çökmesin,
    // hata sadece konsola yazılsın ve liste boş dönse de çalışsın.
    try {
      
    } catch (seedError) {
      console.error("Seed uyarısı (sayfa çalışmaya devam ediyor):", seedError);
    }

    const items = await db.collection("equipment_info").find().toArray();
    return NextResponse.json(items);
  } catch (error) {
    console.error("equipment-info GET hatası:", error);
    return NextResponse.json({ error: "Veriler yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!["yonetici", "planlamaci"].includes(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yönetici veya planlamacı yetkisi gerekir." }, { status: 403 });
    }

    const body = await req.json();
    const { engine_name, kaver_tipi, hava_filtresi, krankcase, esanjor_tipi, dungs, radyator_tipi, not: noteField } = body;
    if (!engine_name || !engine_name.trim()) {
      return NextResponse.json({ error: "Motor adı gerekli." }, { status: 400 });
    }

    const col = db.collection("equipment_info");
    const name = engine_name.trim();
    const existing = await col.findOne({ _id: name });
    if (existing) {
      return NextResponse.json({ error: "Bu motor için zaten bir bilgi kartı var. Listeden düzenleyebilirsiniz." }, { status: 409 });
    }

    const doc = {
      _id: name, engine_name: name,
      kaver_tipi: kaver_tipi || null, hava_filtresi: hava_filtresi || null, krankcase: krankcase || null,
      esanjor_tipi: esanjor_tipi || null, dungs: dungs || null, radyator_tipi: radyator_tipi || null,
      not: noteField || null,
    };
    await col.insertOne(doc);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("equipment-info POST hatası:", error);
    return NextResponse.json({ error: "Motor bilgi kartı eklenirken bir hata oluştu." }, { status: 500 });
  }
}
