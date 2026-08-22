import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!hasPermission(user.role, "reports:read")) return NextResponse.json({ error: "Rapor görme yetkiniz yok." }, { status: 403 });
  await ensureAppIndexes(db);

  const searchParams = new URL(req.url).searchParams;
  const enginePeriod = searchParams.get("period") || "all";
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const engineSince = enginePeriod === "month"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : enginePeriod === "3months"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
      : enginePeriod === "year"
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : null;
  const records = db.collection("maintenance_records") as any;

  const dateMatch = engineSince ? [{ $match: { created_at: { $gte: engineSince } } }] : [];
  const [monthly, byEngine, byType, totals, responsibleStaff, supportStaff] = await Promise.all([
    records.aggregate([
      { $match: { created_at: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$created_at" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    records.aggregate([
      ...(engineSince ? [{ $match: { created_at: { $gte: engineSince } } }] : []),
      { $group: { _id: "$engine_id", engine: { $first: "$engine_name" }, count: { $sum: 1 } } },
      { $sort: { count: -1, engine: 1 } },
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
    records.aggregate([
      ...dateMatch,
      { $group: { _id: "$technician_id", technician: { $first: "$technician_name" }, responsible_count: { $sum: 1 } } },
      { $sort: { responsible_count: -1, technician: 1 } },
      { $limit: 50 },
    ]).toArray(),
    records.aggregate([
      ...dateMatch,
      { $unwind: "$other_technicians" },
      { $group: { _id: "$other_technicians.id", technician: { $first: "$other_technicians.full_name" }, support_count: { $sum: 1 } } },
      { $sort: { support_count: -1, technician: 1 } },
      { $limit: 50 },
    ]).toArray(),
  ]);

  const totalRow = totals[0] || { total: 0, thisCount: 0, lastCount: 0 };
  const technicianMap = new Map<string, { technician: string; responsible_count: number; support_count: number }>();
  responsibleStaff.forEach((row: any) => technicianMap.set(String(row._id), { technician: row.technician || "Bilinmeyen", responsible_count: row.responsible_count || 0, support_count: 0 }));
  supportStaff.forEach((row: any) => {
    const id = String(row._id);
    const current = technicianMap.get(id) || { technician: row.technician || "Bilinmeyen", responsible_count: 0, support_count: 0 };
    current.support_count = row.support_count || 0;
    technicianMap.set(id, current);
  });
  const byTechnician = [...technicianMap.entries()]
    .map(([technician_id, row]) => ({ technician_id, technician: row.technician, responsible_count: row.responsible_count, support_count: row.support_count, total_count: row.responsible_count + row.support_count }))
    .sort((a, b) => b.total_count - a.total_count || a.technician.localeCompare(b.technician, "tr"))
    .slice(0, 12);
  return NextResponse.json({
    monthly: monthly.map((row: any) => ({ month: row._id, count: row.count })),
    byEngine: byEngine.map((row: any) => ({ engine_id: row._id || null, engine: row.engine || "Bilinmeyen", count: row.count })),
    byType: byType.map((row: any) => ({ type: row._id || "Bilinmeyen", count: row.count })),
    byTechnician,
    total: totalRow.total || 0,
    thisCount: totalRow.thisCount || 0,
    lastCount: totalRow.lastCount || 0,
  });
}
