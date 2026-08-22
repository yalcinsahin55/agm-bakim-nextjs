import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

async function getIntervalSummary(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureAppIndexes(db);
    const usersCol = db.collection("users") as any;
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const engineId = new URL(req.url).searchParams.get("engine_id");
    const match: Record<string, string> = {};
    if (engineId) match.engine_id = engineId;

    const recordsCol = db.collection("maintenance_records") as any;
    const groups = await recordsCol.aggregate([
      { $match: match },
      { $sort: { engine_id: 1, type_key: 1, created_at: 1, _id: 1 } },
      {
        $group: {
          _id: { engine_id: "$engine_id", type_key: "$type_key" },
          engine_id: { $first: "$engine_id" },
          engine_name: { $first: "$engine_name" },
          type_key: { $first: "$type_key" },
          type_label: { $first: "$type_label" },
          count: { $sum: 1 },
          first: {
            $first: {
              _id: "$_id",
              created_at: "$created_at",
              hour_at_completion: "$hour_at_completion",
              technician_name: "$technician_name",
            },
          },
          last: {
            $last: {
              _id: "$_id",
              created_at: "$created_at",
              hour_at_completion: "$hour_at_completion",
              technician_name: "$technician_name",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          key: { $concat: ["$engine_id", "::", "$type_key"] },
          engine_id: 1,
          engine_name: 1,
          type_key: 1,
          type_label: 1,
          count: 1,
          first: 1,
          last: 1,
          average_interval: {
            $cond: [
              { $gt: ["$count", 1] },
              {
                $divide: [
                  { $subtract: ["$last.hour_at_completion", "$first.hour_at_completion"] },
                  { $subtract: ["$count", 1] },
                ],
              },
              null,
            ],
          },
        },
      },
    ]).toArray();

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/records/interval-summary hatası:", error);
    return NextResponse.json({ error: "Bakım aralıkları özetlenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/records/interval-summary", () => getIntervalSummary(req));
}
