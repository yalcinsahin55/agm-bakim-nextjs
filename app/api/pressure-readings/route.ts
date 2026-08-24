import { enginesCollection, pressureReadingsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

type PressureEntryInput = {
  engine_id: string;
  status?: unknown;
  pressure_bar?: unknown;
  load_kw?: unknown;
};

type PressureRequestBody = {
  reading_date?: unknown;
  entries?: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const engineId = searchParams.get("engine_id");
    const query = engineId ? { engine_id: engineId } : {};

    const readings = await pressureReadingsCollection(db).find(query).sort({ reading_date: 1 }).toArray();
    return NextResponse.json(readings);
  } catch (error) {
    console.error("Karter basınç verileri getirilirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Karter basınç verileri yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
    const rateLimited = await enforceApiRateLimit(req, "pressure-reading-create", 60, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const body = await req.json() as PressureRequestBody;
    const { reading_date } = body;
    const rawEntries = body.entries;
    if (!Array.isArray(rawEntries) || rawEntries.length === 0 || rawEntries.length > 100) {
      return NextResponse.json({ error: "Kaydedilecek ölçüm sayısı 1 ile 100 arasında olmalıdır." }, { status: 400 });
    }

    const entries: PressureEntryInput[] = [];
    // Her entry için validasyon
    for (const rawEntry of rawEntries) {
      if (!isObjectRecord(rawEntry)) {
        return NextResponse.json({ error: "Bir ölçümde geçerli motor adı eksik." }, { status: 400 });
      }
      const entry = rawEntry;
      if (typeof entry.engine_id !== "string" || !entry.engine_id.trim() || entry.engine_id.length > 120) {
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
      entries.push({ engine_id: entry.engine_id.trim(), status: entry.status, pressure_bar: entry.pressure_bar, load_kw: entry.load_kw });
    }

    const engineIds = [...new Set(entries.map((entry) => entry.engine_id))];
    const engines = await enginesCollection(db).find({ _id: { $in: engineIds } }, { projection: { _id: 1, name: 1 } }).toArray();
    const engineById = new Map<string, { name: string }>(engines.map((engine) => [String(engine._id), { name: String(engine.name || engine._id) }] as [string, { name: string }]));
    if (engineIds.some((engineId) => !engineById.has(engineId))) {
      return NextResponse.json({ error: "Ölçüm listesinde bulunmayan bir motor var." }, { status: 400 });
    }

    const stamp = reading_date === undefined || reading_date === null || reading_date === ""
      ? new Date()
      : reading_date instanceof Date
        ? new Date(reading_date)
        : typeof reading_date === "string" || typeof reading_date === "number"
          ? new Date(reading_date)
          : new Date(Number.NaN);
    if (!Number.isFinite(stamp.getTime())) {
      return NextResponse.json({ error: "Ölçüm tarihi geçersiz." }, { status: 400 });
    }
    const docs = entries.map((entry) => ({
      engine_id: entry.engine_id, engine_name: engineById.get(entry.engine_id)?.name || entry.engine_id, reading_date: stamp,
      load_kw: typeof entry.load_kw === "number" ? entry.load_kw : null,
      pressure_bar: typeof entry.pressure_bar === "number" ? entry.pressure_bar : null,
      status: typeof entry.status === "string" ? entry.status : null,
      new_type: false, note: null, uploaded_by: user.full_name, uploaded_by_id: user._id, created_at: new Date(),
    }));

    const res = await pressureReadingsCollection(db).insertMany(docs);
    return NextResponse.json({ ok: true, inserted: res.insertedCount });
  } catch (error) {
    console.error("Karter basıncı eklenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Karter basıncı kaydedilirken bir hata oluştu." }, { status: 500 });
  }
}
