import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!hasPermission(user.role, "reports:read")) return NextResponse.json({ error: "Rapor görme yetkiniz yok." }, { status: 403 });

  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);
  const records = db.collection("maintenance_records") as any;
  const previousMonth = new Date(since);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [monthly, byEngine, byType, totals] = await Promise.all([
    records.aggregate([
      { $match: { created_at: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$created_at" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    records.aggregate([
      { $group: { _id: "$engine_name", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 },
    ]).toArray(),
    records.aggregate([
      { $group: { _id: "$type_label", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 },
    ]).toArray(),
    records.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          thisCount: { $sum: { $cond: [{ $gte: ["$created_at", monthStart] }, 1, 0] } },
          lastCount: { $sum: { $cond: [{ $and: [{ $gte: ["$created_at", previousMonth] }, { $lt: ["$created_at", monthStart] }] }, 1, 0] } },
        },
      },
    ]).toArray(),
  ]);

  const totalRow = totals[0] || { total: 0, thisCount: 0, lastCount: 0 };
  return NextResponse.json({
    monthly: monthly.map((row: any) => ({ month: row._id, count: row.count })),
    byEngine: byEngine.map((row: any) => ({ engine: row._id || "Bilinmeyen", count: row.count })),
    byType: byType.map((row: any) => ({ type: row._id || "Bilinmeyen", count: row.count })),
    total: totalRow.total || 0,
    thisCount: totalRow.thisCount || 0,
    lastCount: totalRow.lastCount || 0,
  });
}
