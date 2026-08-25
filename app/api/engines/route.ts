import { enginesCollection, recordsCollection, usersCollection } from "@/lib/dbCollections";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { engineSortKey } from "@/lib/status";
import { withApiTiming } from "@/lib/performance";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

function parseNonNegativeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5_000_000 ? parsed : null;
}

async function getEngines(req: NextRequest) {
  try {
    const db = await getDb();

    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const rateLimited = await enforceApiRateLimit(req, "engine-list-read", 240, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const searchParams = new URL(req.url).searchParams;
    const includeHistory = searchParams.get("include_history") === "true";
    const includeMaintenanceCounts = searchParams.get("include_maintenance_counts") === "true";
    // Ana liste için history yalnızca legacy uyumluluk amacıyla tutulur; detay ekranı ayrı paginated endpointi kullanır.
    // `$slice`, tüm gömülü history dizisini server belleğine almadan son 250 kaydı döndürür.
    const options = includeHistory
      ? { projection: { history: { $slice: -250 } } }
      : { projection: { history: 0 } };
    const enginesCol = enginesCollection(db);
    const recordsCol = recordsCollection(db);
    const [engines, countRows] = await Promise.all([
      enginesCol.find({}, options).toArray(),
      includeMaintenanceCounts
        ? recordsCol.aggregate([
            { $group: { _id: "$engine_id", count: { $sum: 1 } } },
          ]).toArray()
        : Promise.resolve([]),
    ]);
    if (includeMaintenanceCounts) {
      const countByEngine = new Map<string, number>(
        countRows.map((row) => [String(row._id), Number(row.count) || 0] as [string, number]),
      );
      for (const engine of engines) {
        engine.maintenance_count = countByEngine.get(String(engine._id)) || 0;
      }
    }
    engines.sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
    return NextResponse.json(engines);
  } catch (error) {
    console.error("Motorlar getirilirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Motorlar yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

async function postEngine(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }
    const rateLimited = await enforceApiRateLimit(req, "engine-create", 30, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const { name, hours, load_kw } = await req.json();
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) {
      return NextResponse.json({ error: "Motor adı gerekli." }, { status: 400 });
    }
    if (!isSafeMongoPathSegment(normalizedName)) {
      return NextResponse.json({ error: "Motor adında nokta, $ veya geçersiz karakter kullanılamaz." }, { status: 400 });
    }
    const parsedHours = parseNonNegativeNumber(hours);
    const parsedLoadKw = parseNonNegativeNumber(load_kw);
    if (parsedHours === null || parsedLoadKw === null) {
      return NextResponse.json({ error: "Motor saati ve yük değeri geçerli, negatif olmayan sayılar olmalıdır." }, { status: 400 });
    }

    const enginesCol = enginesCollection(db);
    const existing = await enginesCol.findOne({ _id: normalizedName });
    if (existing) {
      return NextResponse.json({ error: "Bu isimde bir motor zaten var." }, { status: 409 });
    }

    const now = new Date();
    const doc = {
      _id: normalizedName,
      stable_id: randomUUID(),
      name: normalizedName,
      hours: parsedHours,
      load_kw: parsedLoadKw,
      updated_at: now,
      history: [{ date: now.toISOString(), hours: parsedHours, load_kw: parsedLoadKw }],
    };
    await enginesCol.insertOne(doc);
    invalidateMaintenancePanelServerCache();
    return NextResponse.json(doc);
  } catch (error) {
    console.error("Motor eklenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Motor eklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/engines", () => getEngines(req), { request: req });
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/engines", () => postEngine(req), { request: req });
}
