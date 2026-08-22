import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName } from "@/lib/technicians";

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
  const activeTechnicians = await listActiveTechnicians(db);
  const technicianById = new Map(activeTechnicians.map((technician) => [technician.id, technician]));
  const technicianByName = new Map(activeTechnicians.map((technician) => [normalizeTechnicianName(technician.full_name), technician]));

  const dateMatch = engineSince ? [{ $match: { created_at: { $gte: engineSince } } }] : [];
  const technicianRecordMatch = [{ $match: { technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } } }];
  const internalTechnicianExpr = { $and: [{ $ne: ["$technician_source", "external_service"] }, { $ne: ["$technician_id", EXTERNAL_SERVICE_TECHNICIAN_ID] }] };
  const [monthly, byEngine, byType, totals, responsibleStaff, supportStaff, periodTotals] = await Promise.all([
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
      ...dateMatch,
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
      ...technicianRecordMatch,
      { $group: { _id: "$technician_id", technician: { $first: "$technician_name" }, responsible_count: { $sum: 1 }, responsible_duration_minutes: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
      { $sort: { responsible_count: -1, technician: 1 } },
    ]).toArray(),
    records.aggregate([
      ...dateMatch,
      ...technicianRecordMatch,
      { $unwind: "$other_technicians" },
      { $group: { _id: "$other_technicians.id", technician: { $first: "$other_technicians.full_name" }, support_count: { $sum: 1 }, support_duration_minutes: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
      { $sort: { support_count: -1, technician: 1 } },
    ]).toArray(),
    records.aggregate([
      ...dateMatch,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          total_duration_minutes: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } },
          technician_duration_minutes: { $sum: { $cond: [internalTechnicianExpr, { $multiply: [{ $ifNull: ["$maintenance_duration_minutes", 0] }, { $add: [1, { $size: { $ifNull: ["$other_technicians", []] } }] }] }, 0] } },
          missing_duration: { $sum: { $cond: [internalTechnicianExpr, { $cond: [{ $gt: [{ $ifNull: ["$maintenance_duration_minutes", 0] }, 0] }, 0, 1] }, 0] } },
          technician_tasks: { $sum: { $cond: [internalTechnicianExpr, { $add: [1, { $size: { $ifNull: ["$other_technicians", []] } }] }, 0] } },
        },
      },
    ]).toArray(),
  ]);

  const totalRow = totals[0] || { total: 0, thisCount: 0, lastCount: 0 };
  const periodRow = periodTotals[0] || { total: 0, total_duration_minutes: 0, technician_duration_minutes: 0, missing_duration: 0, technician_tasks: 0 };
  type TechnicianAggregate = { technician: string; responsible_count: number; support_count: number; responsible_duration_minutes: number; support_duration_minutes: number };
  const technicianMap = new Map<string, TechnicianAggregate>();
  function canonicalTechnician(row: any): { key: string; name: string } {
    const id = row?._id != null ? String(row._id) : "";
    const byId = id ? technicianById.get(id) : undefined;
    const byName = technicianByName.get(normalizeTechnicianName(row?.technician));
    const canonical = byId || byName;
    return {
      key: canonical?.id || id || normalizeTechnicianName(row?.technician) || "unknown",
      name: canonical?.full_name || (typeof row?.technician === "string" && row.technician.trim() ? row.technician.trim() : "Bilinmeyen"),
    };
  }
  function mergeTechnicianRow(row: any, kind: "responsible" | "support") {
    const canonical = canonicalTechnician(row);
    const current = technicianMap.get(canonical.key) || { technician: canonical.name, responsible_count: 0, support_count: 0, responsible_duration_minutes: 0, support_duration_minutes: 0 };
    current.technician = canonical.name;
    if (kind === "responsible") {
      current.responsible_count += Number(row.responsible_count || 0);
      current.responsible_duration_minutes += Number(row.responsible_duration_minutes || 0);
    } else {
      current.support_count += Number(row.support_count || 0);
      current.support_duration_minutes += Number(row.support_duration_minutes || 0);
    }
    technicianMap.set(canonical.key, current);
  }
  responsibleStaff.forEach((row: any) => mergeTechnicianRow(row, "responsible"));
  supportStaff.forEach((row: any) => mergeTechnicianRow(row, "support"));
  const byTechnician = [...technicianMap.entries()]
    .map(([technician_id, row]) => ({ technician_id, technician: row.technician, responsible_count: row.responsible_count, support_count: row.support_count, total_count: row.responsible_count + row.support_count, responsible_duration_minutes: row.responsible_duration_minutes, support_duration_minutes: row.support_duration_minutes, total_duration_minutes: row.responsible_duration_minutes + row.support_duration_minutes, average_duration_minutes: row.responsible_count + row.support_count ? Math.round((row.responsible_duration_minutes + row.support_duration_minutes) / (row.responsible_count + row.support_count)) : 0 }))
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
    periodTotal: periodRow.total || 0,
    periodDurationMinutes: periodRow.total_duration_minutes || 0,
    periodTechnicianDurationMinutes: periodRow.technician_duration_minutes || 0,
    periodMissingDuration: periodRow.missing_duration || 0,
    periodTechnicianTasks: periodRow.technician_tasks || 0,
  });
}
