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

    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const searchParams = new URL(req.url).searchParams;
    const includeHistory = searchParams.get("include_history") === "true";
    const includeMaintenanceCounts = searchParams.get("include_maintenance_counts") === "true";
    const projection = includeHistory ? undefined : { history: 0 };
    const enginesCol = db.collection("engines") as any;
    const recordsCol = db.collection("maintenance_records") as any;
    const [engines, countRows] = await Promise.all([
      enginesCol.find({}, projection).toArray(),
      includeMaintenanceCounts
        ? recordsCol.aggregate([
            { $group: { _id: "$engine_id", count: { $sum: 1 } } },
          ]).toArray()
        : Promise.resolve([]),
    ]);
    if (includeMaintenanceCounts) {
      const countByEngine = new Map<string, number>(
        countRows.map((row: any) => [String(row._id), Number(row.count) || 0]),
      );
      for (const engine of engines) {
        engine.maintenance_count = countByEngine.get(String(engine._id)) || 0;
      }
    }
    engines.sort((a: any, b: any) => engineSortKey(a.name) - engineSortKey(b.name));
    return NextResponse.json(engines);
  } catch (error) {
    console.error("Motorlar getirilirken hata:", error);
    return NextResponse.json({ error: "Motorlar yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

async function postEngine(req: NextRequest) {
  try {
    const db = await getDb();
    const usersCol = db.collection("users") as any;
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

    const enginesCol = db.collection("engines") as any;
    const existing = await enginesCol.findOne({ _id: normalizedName });
    if (existing) {
      return NextResponse.json({ error: "Bu isimde bir motor zaten var." }, { status: 409 });
    }

    const now = new Date();
    const doc = {
      _id: normalizedName,
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
    console.error("Motor eklenirken hata:", error);
    return NextResponse.json({ error: "Motor eklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/engines", () => getEngines(req));
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/engines", () => postEngine(req));
}
