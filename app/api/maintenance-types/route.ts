import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { normalizeWorkDomains } from "@/lib/technicians";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

function slugifyKey(label: string): string {
  const trMap: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  let s = label.toLowerCase().replace(/[çğıöşü]/g, (ch) => trMap[ch] || ch);
  s = s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const types = await (db.collection("maintenance_types") as any).find({ is_deleted: { $ne: true } }).toArray();
    return NextResponse.json(types);
  } catch (error) {
    console.error("Bakım türleri getirilirken hata:", error);
    return NextResponse.json({ error: "Bakım türleri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role !== "yonetici") {
      return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
    }
    const rateLimited = enforceApiRateLimit(req, "maintenance-type-create", 30, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const { label, default_period_hours, apply_to_all, engine_states, work_domains, allow_electromechanical_support, allow_electromechanical_responsible } = await req.json();
    const normalizedWorkDomains = normalizeWorkDomains(work_domains, "mekanik");
    if (!label || !label.trim()) {
      return NextResponse.json({ error: "Bakım türü adı gerekli." }, { status: 400 });
    }

    const key = slugifyKey(label);
    if (!key) {
      return NextResponse.json({ error: "Geçersiz isim. Lütfen Türkçe karakterler ve harfler kullanın." }, { status: 400 });
    }

    const typesCol = db.collection("maintenance_types") as any;
    const existing = await typesCol.findOne({ _id: key });
    if (existing) {
      return NextResponse.json({ error: "Bu veya çok benzer isimde bir bakım türü zaten var." }, { status: 409 });
    }

    // 🎯 Motor bazlı durumlar (yeni özellik) — yoksa eski apply_to_all davranışı
    let engineStates: Record<string, { last_maintenance_hour: number; period_hours: number; tracking_source: "manual" }> = {};
    if (engine_states && typeof engine_states === "object") {
      Object.entries(engine_states).forEach(([engId, st]: [string, any]) => {
        engineStates[engId] = {
          last_maintenance_hour: Number(st?.last_maintenance_hour) || 0,
          period_hours: Number(st?.period_hours) || 0,
          tracking_source: "manual",
        };
      });
    } else if (apply_to_all) {
      const engines = await (db.collection("engines") as any).find().toArray();
      engines.forEach((e: any) => {
        engineStates[e._id] = { last_maintenance_hour: e.hours, period_hours: Number(default_period_hours) || 0, tracking_source: "manual" };
      });
    }

    const doc = {
      _id: key,
      key,
      label: label.trim(),
      default_period_hours: Number(default_period_hours) || 0,
      engine_scope: apply_to_all ? "all" : "explicit",
      work_domains: normalizedWorkDomains,
      allow_electromechanical_support: allow_electromechanical_support === true,
      allow_electromechanical_responsible: allow_electromechanical_responsible === true,
      engine_states: engineStates,
    };
    await typesCol.insertOne(doc);
    return NextResponse.json(doc);
  } catch (error) {
    console.error("Bakım türü eklenirken hata:", error);
    return NextResponse.json({ error: "Bakım türü eklenirken bir hata oluştu." }, { status: 500 });
  }
}
