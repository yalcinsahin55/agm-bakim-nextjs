import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { withApiTiming } from "@/lib/performance";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";

export const dynamic = "force-dynamic";

interface HistoryEntry {
  date: string;
  hours: number;
  load_kw?: number;
}

function parsePageParams(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const requestedLimit = Number(searchParams.get("limit") || 250);
  const requestedPage = Number(searchParams.get("page") || 1);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 250) : 250;
  const page = Number.isFinite(requestedPage) ? Math.max(Math.trunc(requestedPage), 1) : 1;
  return { limit, page, skip: (page - 1) * limit };
}

function isValidHistoryEntry(value: unknown): value is HistoryEntry {
  const entry = value as Partial<HistoryEntry> | null;
  return Boolean(
    entry &&
      typeof entry.date === "string" &&
      !Number.isNaN(new Date(entry.date).getTime()) &&
      typeof entry.hours === "number" &&
      Number.isFinite(entry.hours) &&
      (entry.load_kw === undefined || (typeof entry.load_kw === "number" && Number.isFinite(entry.load_kw))),
  );
}

function sortHistory(history: HistoryEntry[]): HistoryEntry[] {
  return [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function persistHistory(enginesCol: any, engine: any, history: HistoryEntry[]) {
  const sorted = sortHistory(history);
  const update: Record<string, any> = { history: sorted, updated_at: new Date() };
  // Geçmişteki en güncel kayıt, motorun güncel çalışma saati ve yükünü de temsil eder.
  if (sorted.length > 0) {
    update.hours = sorted[sorted.length - 1].hours;
    if (typeof sorted[sorted.length - 1].load_kw === "number") {
      update.load_kw = sorted[sorted.length - 1].load_kw;
    }
  }
  await enginesCol.updateOne({ _id: engine._id }, { $set: update });
  return update;
}

async function getHistory(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const { limit, page, skip } = parsePageParams(req);
    const enginesCol = db.collection("engines") as any;
    const engine = await enginesCol.findOne(
      { _id: id },
      { projection: { _id: 1, name: 1, hours: 1, load_kw: 1 } },
    );
    if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

    // Geçmiş gömülü tutulduğu için yalnız seçilen motor açılır; unwind/sort
    // sıralamayı güvenceye alır ve response'a sadece istenen sayfa çıkar.
    const [result] = await enginesCol.aggregate([
      { $match: { _id: id } },
      { $project: { history: { $ifNull: ["$history", []] } } },
      { $unwind: { path: "$history", includeArrayIndex: "history_index" } },
      { $sort: { "history.date": 1, history_index: 1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          summary: [
            {
              $group: {
                _id: null,
                first: { $first: "$history" },
                last: { $last: "$history" },
                has_load: { $max: { $cond: [{ $isNumber: "$history.load_kw" }, 1, 0] } },
              },
            },
          ],
          data: [
            { $skip: skip },
            { $limit: limit },
            { $replaceRoot: { newRoot: "$history" } },
          ],
        },
      },
    ]).toArray();

    const total = Number(result?.metadata?.[0]?.total || 0);
    const summary = result?.summary?.[0] || {};
    return NextResponse.json({
      engine: { _id: engine._id, name: engine.name, hours: engine.hours, load_kw: engine.load_kw },
      history: (result?.data || []) as HistoryEntry[],
      total,
      page,
      limit,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      summary: {
        first: summary.first || null,
        last: summary.last || null,
        has_load: summary.has_load === 1,
      },
    });
  } catch (error) {
    console.error("Motor saat geçmişi getirilirken hata:", error);
    return NextResponse.json({ error: "Motor saat geçmişi yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

async function patchHistory(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekir." }, { status: 403 });
    }

    const body = await req.json();
    const enginesCol = db.collection("engines") as any;
    const engine = await enginesCol.findOne({ _id: id });
    if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

    // Hedefli düzenleme/silme sırasında legacy alanları veya eski biçimleri sessizce düşürme.
    const currentHistory = Array.isArray(engine.history) ? sortHistory(engine.history as HistoryEntry[]) : [];
    let nextHistory: HistoryEntry[];

    if (Array.isArray(body.history)) {
      if (!body.history.every(isValidHistoryEntry)) {
        return NextResponse.json({ error: "Her kayıt için geçerli bir tarih ve saat gerekli." }, { status: 400 });
      }
      nextHistory = body.history;
    } else if (Number.isInteger(body.entry_index)) {
      const index = Number(body.entry_index);
      if (index < 0 || index >= currentHistory.length) {
        return NextResponse.json({ error: "Geçmiş kaydı bulunamadı." }, { status: 404 });
      }

      if (body.delete === true) {
        nextHistory = currentHistory.filter((_, currentIndex) => currentIndex !== index);
      } else {
        if (!isValidHistoryEntry(body.entry)) {
          return NextResponse.json({ error: "Geçerli bir tarih ve saat gerekli." }, { status: 400 });
        }
        nextHistory = currentHistory.map((entry, currentIndex) => currentIndex === index ? body.entry : entry);
      }
    } else {
      return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
    }

    const update = await persistHistory(enginesCol, engine, nextHistory);
    invalidateMaintenancePanelServerCache();
    return NextResponse.json({ ok: true, hours: update.hours ?? engine.hours });
  } catch (error) {
    console.error("Motor saat geçmişi güncellenirken hata:", error);
    return NextResponse.json({ error: "Motor saat geçmişi güncellenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("GET /api/engines/[id]/history", () => getHistory(req, context));
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("PATCH /api/engines/[id]/history", () => patchHistory(req, context));
}
