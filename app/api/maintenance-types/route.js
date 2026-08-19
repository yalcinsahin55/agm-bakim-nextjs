import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function slugifyKey(label) {
  const trMap = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  let s = label.toLowerCase().replace(/[çğıöşü]/g, (ch) => trMap[ch] || ch);
  s = s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s;
}

export async function GET(req) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const types = await db.collection("maintenance_types").find().toArray();
    return NextResponse.json(types);
  } catch (error) {
    console.error("Bakım türleri getirilirken hata:", error);
    return NextResponse.json({ error: "Bakım türleri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role !== "yonetici") {
      return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
    }

    const { label, default_period_hours, apply_to_all } = await req.json();
    if (!label || !label.trim()) {
      return NextResponse.json({ error: "Bakım türü adı gerekli." }, { status: 400 });
    }
    
    const key = slugifyKey(label);
    if (!key) return NextResponse.json({ error: "Geçersiz isim. Lütfen Türkçe karakterler ve harfler kullanın." }, { status: 400 });

    const typesCol = db.collection("maintenance_types");
    const existing = await typesCol.findOne({ _id: key });
    if (existing) {
      return NextResponse.json({ error: "Bu veya çok benzer isimde bir bakım türü zaten var." }, { status: 409 });
    }

    let engineStates = {};
    if (apply_to_all) {
      const engines = await db.collection("engines").find().toArray();
      engines.forEach((e) => {
        engineStates[e._id] = { last_maintenance_hour: e.hours, period_hours: default_period_hours };
      });
    }

    const doc = {
      _id: key, key, label: label.trim(),
      default_period_hours: Number(default_period_hours) || 0, engine_states: engineStates,
    };
    await typesCol.insertOne(doc);
    return NextResponse.json(doc);
  } catch (error) {
    console.error("Bakım türü eklenirken hata:", error);
    return NextResponse.json({ error: "Bakım türü eklenirken bir hata oluştu." }, { status: 500 });
  }
}
