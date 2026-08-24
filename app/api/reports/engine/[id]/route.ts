import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

function parseParams(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const all = searchParams.get("all") === "1";
  const requestedPage = Number(searchParams.get("page") || 1);
  const requestedPageSize = Number(searchParams.get("page_size") || 50);
  const page = Number.isFinite(requestedPage) ? Math.max(Math.trunc(requestedPage), 1) : 1;
  const pageSize = all ? 5_000 : Number.isFinite(requestedPageSize) ? Math.min(Math.max(Math.trunc(requestedPageSize), 1), 50) : 50;
  return { all, page, pageSize, skip: (page - 1) * pageSize };
}

async function getEngineReport(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    await ensureAppIndexes(db);
    const usersCol = usersCollection(db);
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (!hasPermission(user.role, "reports:read")) return NextResponse.json({ error: "Rapor görme yetkiniz yok." }, { status: 403 });

    const { all, page, pageSize, skip } = parseParams(req);
    const searchParams = new URL(req.url).searchParams;
    const typeLabel = searchParams.get("type_label");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const match: Record<string, unknown> = { engine_id: id };
    if (typeLabel) match.type_label = typeLabel;
    const recordsCol = recordsCollection(db);
    const pipeline: Record<string, unknown>[] = [
      { $set: { maintenance_date: { $ifNull: ["$maintenance_start_at", "$created_at"] } } },
      { $match: match },
    ];
    if (from || to) {
      pipeline.push({ $match: { maintenance_date: {
        ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      } } });
    }
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        stats: [
          { $set: { __maintenance_group_key: { $cond: [{ $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] }, "$group_id", { $toString: "$_id" }] } } },
          { $group: {
            _id: "$__maintenance_group_key",
            first_date: { $min: "$maintenance_date" },
            last_date: { $max: "$maintenance_date" },
            total_duration_minutes: { $max: { $ifNull: ["$maintenance_duration_minutes", 0] } },
          } },
          { $group: {
            _id: null,
            first_date: { $min: "$first_date" },
            last_date: { $max: "$last_date" },
            total_duration_minutes: { $sum: "$total_duration_minutes" },
          } },
        ],
        records: [
          { $sort: { maintenance_date: -1, _id: -1 } },
          { $skip: skip },
          { $limit: pageSize },
          {
            $project: {
              _id: 1,
              engine_id: 1,
              engine_name: 1,
              type_label: 1,
              hour_at_completion: 1,
              maintenance_start_at: 1,
              maintenance_end_at: 1,
              maintenance_duration_minutes: 1,
              technician_name: 1,
              other_technicians: 1,
              created_at: 1,
              maintenance_date: 1,
            },
          },
        ],
      },
    });
    const [result] = await recordsCol.aggregate(pipeline).toArray();

    const total = Number(result?.metadata?.[0]?.total || 0);
    const range = result?.stats?.[0];
    const firstTime = range?.first_date ? new Date(range.first_date).getTime() : 0;
    const lastTime = range?.last_date ? new Date(range.last_date).getTime() : 0;
    const avgDays = total > 1 && lastTime >= firstTime ? Math.round((lastTime - firstTime) / 86400000 / (total - 1)) : 0;

    return NextResponse.json({
      records: result?.records || [],
      total,
      page,
      pageSize,
      totalPages: all ? 1 : Math.max(Math.ceil(total / pageSize), 1),
      all,
      truncated: all && total > pageSize,
      summary: {
        first_date: range?.first_date || null,
        last_date: range?.last_date || null,
        avg_days: avgDays,
        total_duration_minutes: Number(range?.total_duration_minutes || 0),
      },
    });
  } catch (error) {
    console.error("GET /api/reports/engine/[id] hatası:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Motor raporu hazırlanırken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("GET /api/reports/engine/[id]", () => getEngineReport(req, context), { request: req });
}
