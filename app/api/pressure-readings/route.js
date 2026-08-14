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

  const readings = await db.collection("pressure_readings").find(query).sort({ reading_date: 1 }).toArray();
  return NextResponse.json(readings);
}

export async function POST(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role === "goruntuleyici") return NextResponse.json({ error: "Görüntüleyici rolü ölçüm ekleyemez." }, { status: 403 });

  const { reading_date, entries } = await req.json();
  // entries: [{ engine_id, load_kw, pressure_bar, status }]
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "Kaydedilecek ölçüm bulunamadı." }, { status: 400 });
  }

  const stamp = reading_date ? new Date(reading_date) : new Date();
  const docs = entries.map((e) => ({
    engine_id: e.engine_id, engine_name: e.engine_id, reading_date: stamp,
    load_kw: e.load_kw ?? null, pressure_bar: e.pressure_bar ?? null, status: e.status || null,
    new_type: false, note: null, uploaded_by: user.full_name, uploaded_by_id: user._id, created_at: new Date(),
  }));

  const res = await db.collection("pressure_readings").insertMany(docs);
  return NextResponse.json({ ok: true, inserted: res.insertedCount });
}
