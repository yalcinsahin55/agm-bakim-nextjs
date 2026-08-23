import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

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

    const readings = await (db.collection("pressure_readings") as any).find(query).sort({ reading_date: 1 }).toArray();
    return NextResponse.json(readings);
  } catch (error) {
    console.error("Karter basınç verileri getirilirken hata:", error);
    return NextResponse.json({ error: "Karter basınç verileri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
    const rateLimited = await enforceApiRateLimit(req, "pressure-reading-create", 60, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const { reading_date, entries } = await req.json();
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
      return NextResponse.json({ error: "Kaydedilecek ölçüm sayısı 1 ile 100 arasında olmalıdır." }, { status: 400 });
    }

    // Her entry için validasyon
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || typeof entry.engine_id !== "string" || !entry.engine_id.trim() || entry.engine_id.length > 120) {
        return NextResponse.json({ error: "Bir ölçümde geçerli motor adı eksik." }, { status: 400 });
      }
      const maintenanceStatus = entry.status === "BAKIMDA";
      const hasPressure = typeof entry.pressure_bar === "number" && Number.isFinite(entry.pressure_bar) && entry.pressure_bar >= 0 && entry.pressure_bar <= 200;
      const pressureProvided = entry.pressure_bar !== undefined && entry.pressure_bar !== null;
      if (pressureProvided && !hasPressure) {
        return NextResponse.json({ error: "Basınç değeri 0 ile 200 arasında geçerli bir sayı olmalıdır." }, { status: 400 });
      }
      const hasLoad = typeof entry.load_kw === "number" && Number.isFinite(entry.load_kw) && entry.load_kw >= 0 && entry.load_kw <= 5_000_000;
      const loadProvided = entry.load_kw !== undefined && entry.load_kw !== null;
      if (loadProvided && !hasLoad) {
        return NextResponse.json({ error: "Yük değeri geçerli, negatif olmayan bir sayı olmalıdır." }, { status: 400 });
      }
      if (!maintenanceStatus && !hasPressure && !hasLoad) {
        return NextResponse.json({ error: "Ölçüm için basınç veya yük değeri girin; bakımda kaydı için durum alanı BAKIMDA olmalıdır." }, { status: 400 });
      }
      if (entry.status !== undefined && entry.status !== null && (typeof entry.status !== "string" || entry.status.length > 100)) {
        return NextResponse.json({ error: "Ölçüm durumu geçersiz veya çok uzun." }, { status: 400 });
      }
    }

    const engineIds = [...new Set(entries.map((entry: any) => entry.engine_id.trim()))];
    const engines = await (db.collection("engines") as any).find({ _id: { $in: engineIds } }, { projection: { _id: 1, name: 1 } }).toArray();
    const engineById = new Map<string, { name: string }>(engines.map((engine: any) => [String(engine._id), { name: String(engine.name || engine._id) }] as [string, { name: string }]));
    if (engineIds.some((engineId) => !engineById.has(engineId))) {
      return NextResponse.json({ error: "Ölçüm listesinde bulunmayan bir motor var." }, { status: 400 });
    }

    const stamp = reading_date ? new Date(reading_date) : new Date();
    if (!Number.isFinite(stamp.getTime())) {
      return NextResponse.json({ error: "Ölçüm tarihi geçersiz." }, { status: 400 });
    }
    const docs = entries.map((e: any) => ({
      engine_id: e.engine_id.trim(), engine_name: engineById.get(e.engine_id.trim())?.name || e.engine_id.trim(), reading_date: stamp,
      load_kw: e.load_kw ?? null, pressure_bar: e.pressure_bar ?? null, status: e.status || null,
      new_type: false, note: null, uploaded_by: user.full_name, uploaded_by_id: user._id, created_at: new Date(),
    }));

    const res = await (db.collection("pressure_readings") as any).insertMany(docs);
    return NextResponse.json({ ok: true, inserted: res.insertedCount });
  } catch (error) {
    console.error("Karter basıncı eklenirken hata:", error);
    return NextResponse.json({ error: "Karter basıncı kaydedilirken bir hata oluştu." }, { status: 500 });
  }
}
