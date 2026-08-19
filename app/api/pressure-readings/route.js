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

    const { searchParams } = new URL(req.url);
    const engineId = searchParams.get("engine_id");
    const query = engineId ? { engine_id: engineId } : {};

    const readings = await db.collection("pressure_readings").find(query).sort({ reading_date: 1 }).toArray();
    return NextResponse.json(readings);
  } catch (error) {
    console.error("Karter basınç verileri getirilirken hata:", error);
    return NextResponse.json({ error: "Karter basınç verileri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role === "goruntuleyici") return NextResponse.json({ error: "Görüntüleyici rolü ölçüm ekleyemez." }, { status: 403 });

    const { reading_date, entries } = await req.json();
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "Kaydedilecek ölçüm bulunamadı." }, { status: 400 });
    }
    
    // Her entry için validasyon
    for (const entry of entries) {
      if (!entry.engine_id) {
        return NextResponse.json({ error: "Bir ölçümde motor adı eksik." }, { status: 400 });
      }
      if (typeof entry.pressure_bar !== "number" || entry.pressure_bar < 0) {
        return NextResponse.json({ error: "Basınç değeri 0'dan büyük bir sayı olmalıdır." }, { status: 400 });
      }
    }

    const stamp = reading_date ? new Date(reading_date) : new Date();
    const docs = entries.map((e) => ({
      engine_id: e.engine_id, engine_name: e.engine_id, reading_date: stamp,
      load_kw: e.load_kw ?? null, pressure_bar: e.pressure_bar ?? null, status: e.status || null,
      new_type: false, note: null, uploaded_by: user.full_name, uploaded_by_id: user._id, created_at: new Date(),
    }));

    const res = await db.collection("pressure_readings").insertMany(docs);
    return NextResponse.json({ ok: true, inserted: res.insertedCount });
  } catch (error) {
    console.error("Karter basıncı eklenirken hata:", error);
    return NextResponse.json({ error: "Karter basıncı kaydedilirken bir hata oluştu." }, { status: 500 });
  }
}
