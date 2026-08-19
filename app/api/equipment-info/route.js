import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import equipmentSeed from "@/lib/equipment_info.json";

export const dynamic = "force-dynamic";

async function seedEquipmentIfEmpty(db) {
  const col = db.collection("equipment_info");
  const count = await col.countDocuments();
  if (count > 0) return;
  const ops = Object.entries(equipmentSeed).map(([name, info]) => ({
    updateOne: { filter: { _id: name }, update: { $setOnInsert: { ...info, engine_name: name } }, upsert: true },
  }));
  if (ops.length) await col.bulkWrite(ops);
}

export async function GET(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  await seedEquipmentIfEmpty(db);
  const items = await db.collection("equipment_info").find().toArray();
  return NextResponse.json(items);
}

export async function POST(req) {
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
}
