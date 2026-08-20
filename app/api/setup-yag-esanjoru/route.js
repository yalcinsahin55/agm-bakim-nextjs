import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 20000 H periyodu kullanacak 14 özel motor
const SPECIAL_ENGINES = [
  "AGM-1", "AGM-2", "AGM-3", "AGM-4", "AGM-5", "AGM-6",
  "AGM-9", "AGM-10", "AGM-11", "AGM-12", "AGM-15", "AGM-16",
  "AGM-38", "AGM-39",
];

// İsim karşılaştırması için normalize etme (büyük/küçük harf, tire, boşluk fark etmez)
function norm(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function GET(req) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, db.collection("users"));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role !== "yonetici") return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });

    const typesCol = db.collection("maintenance_types");
    const enginesCol = db.collection("engines");

    const allTypes = await typesCol.find().toArray();
    const t20 = allTypes.find((t) => norm(t.label).includes("20000"));
    const t18 = allTypes.find((t) => norm(t.label).includes("18000"));

    if (!t20 || !t18) {
      return NextResponse.json({
        error: "20000 veya 18000 bakım türü bulunamadı. Mevcut türler: " + allTypes.map((t) => t.label).join(", "),
      }, { status: 404 });
    }

    const engines = await enginesCol.find().toArray();
    const specialSet = new Set(SPECIAL_ENGINES.map(norm));

    const engineStates = {};
    let specialCount = 0;
    let otherCount = 0;
    const unmatched = [];

    for (const e of engines) {
      const isSpecial = specialSet.has(norm(e.name)) || specialSet.has(norm(e._id));
      const src = isSpecial ? t20 : t18;
      const srcState = (src.engine_states || {})[e._id];

      engineStates[e._id] = {
        last_maintenance_hour: srcState ? srcState.last_maintenance_hour : (e.hours || 0),
        period_hours: srcState ? srcState.period_hours : (src.default_period_hours || (isSpecial ? 20000 : 18000)),
      };

      if (isSpecial) specialCount++;
      else otherCount++;
    }

    // Listedeki 14 motordan veritabanında bulunamayanlar (isim kontrolü)
    const engineNorms = new Set(engines.map((e) => norm(e.name)));
    SPECIAL_ENGINES.forEach((s) => {
      if (!engineNorms.has(norm(s))) unmatched.push(s);
    });

    const key = "yag_esanjoru_bakimi";
    const doc = {
      _id: key,
      key,
      label: "YAĞ EŞANJÖRÜ BAKIMI",
      default_period_hours: t18.default_period_hours || 18000,
      engine_states: engineStates,
    };

    await typesCol.updateOne({ _id: key }, { $set: doc }, { upsert: true });

    return NextResponse.json({
      ok: true,
      message: "YAĞ EŞANJÖRÜ BAKIMI türü oluşturuldu!",
      ozelMotor20000: specialCount,
      digerMotor18000: otherCount,
      toplamMotor: engines.length,
      veritabanindaBulunamayanOzelIsimler: unmatched,
      kaynak20000: t20.label,
      kaynak18000: t18.label,
    });
  } catch (error) {
    console.error("setup-yag-esanjoru hatası:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
