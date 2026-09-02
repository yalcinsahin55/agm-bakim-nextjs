import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName, normalizeTechnicianType, TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { withApiTiming } from "@/lib/performance";
import { maintenanceDateCandidateMatch } from "@/lib/maintenanceDateQuery";
import { sortTechnicianSummary } from "@/lib/technicianSummary";

export const dynamic = "force-dynamic";

type MonthlyAggregateRow = { _id?: string; count?: number };
type EngineAggregateRow = { _id?: string; engine?: string; count?: number };
type TypeAggregateRow = { _id?: string; count?: number };
type TotalsAggregateRow = { total?: number; thisCount?: number; lastCount?: number };
type PeriodTotalsAggregateRow = { total?: number; total_duration_minutes?: number; technician_duration_minutes?: number; missing_duration?: number; technician_tasks?: number };
type TechnicianAggregateRow = {
  _id?: unknown;
  technician?: unknown;
  technician_type?: unknown;
  responsible_count?: number;
  support_count?: number;
  responsible_duration_minutes?: number;
  support_duration_minutes?: number;
};

type AnalyticsCacheEntry = { expiresAt: number; value: Record<string, unknown> };
const ANALYTICS_CACHE_TTL_MS = 10_000;
const VALID_ENGINE_PERIODS = new Set(["all", "month", "3months", "year"]);
const analyticsCache = new Map<string, AnalyticsCacheEntry>();

async function getAnalyticsSummary(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (!hasPermission(user.role, "reports:read")) return NextResponse.json({ error: "Rapor görme yetkiniz yok." }, { status: 403 });
  const rateLimited = await enforceApiRateLimit(req, "analytics-summary", 30, 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  await ensureAppIndexes(db);

  const searchParams = new URL(req.url).searchParams;
  const requestedPeriod = searchParams.get("period") || "all";
  const enginePeriod = VALID_ENGINE_PERIODS.has(requestedPeriod) ? requestedPeriod : "all";
  const cached = analyticsCache.get(enginePeriod);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value, { headers: { "Cache-Control": "no-store", "X-Analytics-Cache": "HIT" } });
  }
  if (cached) analyticsCache.delete(enginePeriod);
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
  const records = recordsCollection(db);
  const aggregate = <T extends Document>(pipeline: Document[]) => records.aggregate<T>(pipeline, { allowDiskUse: true });
  const activeTechniciansPromise = listActiveTechnicians(db);

  const normalizeMaintenanceDateStage = { $set: { maintenance_date: { $convert: { input: { $ifNull: ["$maintenance_start_at", "$created_at"] }, to: "date", onError: null, onNull: null } } } };
  const dateRangeStages = (from?: Date, to?: Date): Document[] => {
    const candidate = maintenanceDateCandidateMatch(from, to);
    return [
      ...(candidate ? [{ $match: candidate }] : []),
      normalizeMaintenanceDateStage,
      ...(from || to ? [{ $match: { maintenance_date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } }] : []),
    ];
  };
  const dateMatch = engineSince ? dateRangeStages(engineSince) : [];
  const monthlyDateMatch = dateRangeStages(since);
  const technicianRecordMatch = [{ $match: { technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } } }];
  const internalTechnicianExpr = { $and: [{ $ne: ["$technician_source", "external_service"] }, { $ne: ["$technician_id", EXTERNAL_SERVICE_TECHNICIAN_ID] }] };
  const contributionStages = (role: "responsible" | "support") => [
    ...dateMatch,
    ...technicianRecordMatch,
    {
      $project: {
        group_key: {
          $cond: [
            { $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] },
            "$group_id",
            { $toString: "$_id" },
          ],
        },
        contributions: {
          $cond: [
            { $and: [{ $isArray: "$technician_contributions" }, { $gt: [{ $size: { $ifNull: ["$technician_contributions", []] } }, 0] }] },
            "$technician_contributions",
            {
              $concatArrays: [
                [{ id: "$technician_id", full_name: "$technician_name", technician_type: { $ifNull: ["$technician_type", "mekanik"] }, contribution_role: "responsible", duration_minutes: { $ifNull: ["$maintenance_duration_minutes", 0] } }],
                {
                  $map: {
                    input: { $ifNull: ["$other_technicians", []] },
                    as: "technician",
                    in: { id: "$$technician.id", full_name: "$$technician.full_name", technician_type: { $ifNull: ["$$technician.technician_type", "mekanik"] }, contribution_role: "support", duration_minutes: { $ifNull: ["$maintenance_duration_minutes", 0] } },
                  },
                },
              ],
            },
          ],
        },
      },
    },
    { $unwind: "$contributions" },
    { $match: { "contributions.contribution_role": role } },
    { $group: { _id: { group_key: "$group_key", technician_id: "$contributions.id" }, technician: { $first: "$contributions.full_name" }, technician_type: { $first: "$contributions.technician_type" }, duration_minutes: { $max: { $ifNull: ["$contributions.duration_minutes", 0] } } } },
    { $group: { _id: "$_id.technician_id", technician: { $first: "$technician" }, technician_type: { $first: "$technician_type" }, [`${role}_count`]: { $sum: 1 }, [`${role}_duration_minutes`]: { $sum: "$duration_minutes" } } },
    { $sort: { [`${role}_count`]: -1, technician: 1 } },
  ];
  const [activeTechnicians, monthly, byEngine, byType, totals, responsibleStaff, supportStaff, periodTotals] = await Promise.all([activeTechniciansPromise,
    aggregate<MonthlyAggregateRow>([
      ...monthlyDateMatch,
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$maintenance_date", timezone: "Europe/Istanbul" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    aggregate<EngineAggregateRow>([
      ...dateMatch,
      { $group: { _id: "$engine_id", engine: { $first: "$engine_name" }, count: { $sum: 1 } } },
      { $sort: { count: -1, engine: 1 } },
      { $limit: 12 },
    ]).toArray(),
    aggregate<TypeAggregateRow>([
      ...dateMatch,
      { $group: { _id: "$type_label", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 },
    ]).toArray(),
    aggregate<TotalsAggregateRow>([
      normalizeMaintenanceDateStage,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          thisCount: { $sum: { $cond: [{ $gte: ["$maintenance_date", monthStart] }, 1, 0] } },
          lastCount: { $sum: { $cond: [{ $and: [{ $gte: ["$maintenance_date", previousMonth] }, { $lt: ["$maintenance_date", monthStart] }] }, 1, 0] } },
        },
      },
    ]).toArray(),
    aggregate<TechnicianAggregateRow>(contributionStages("responsible")).toArray(),
    aggregate<TechnicianAggregateRow>(contributionStages("support")).toArray(),
    aggregate<PeriodTotalsAggregateRow>([
      ...dateMatch,
      {
        $set: {
          __maintenance_group_key: {
            $cond: [
              { $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] },
              "$group_id",
              { $toString: "$_id" },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$__maintenance_group_key",
          record_count: { $sum: 1 },
          total_duration_minutes: { $max: { $ifNull: ["$maintenance_duration_minutes", 0] } },
          technician_duration_minutes: { $max: { $cond: [internalTechnicianExpr, {
            $cond: [
              { $and: [{ $isArray: "$technician_contributions" }, { $gt: [{ $size: { $ifNull: ["$technician_contributions", []] } }, 0] }] },
              { $sum: { $map: { input: "$technician_contributions", as: "contribution", in: { $ifNull: ["$$contribution.duration_minutes", 0] } } } },
              { $multiply: [{ $ifNull: ["$maintenance_duration_minutes", 0] }, { $add: [1, { $size: { $ifNull: ["$other_technicians", []] } }] }] },
            ],
          }, 0] } },
          missing_duration: { $max: { $cond: [internalTechnicianExpr, { $cond: [{ $gt: [{ $ifNull: ["$maintenance_duration_minutes", 0] }, 0] }, 0, 1] }, 0] } },
          technician_tasks: { $max: { $cond: [internalTechnicianExpr, {
            $cond: [
              { $and: [{ $isArray: "$technician_contributions" }, { $gt: [{ $size: { $ifNull: ["$technician_contributions", []] } }, 0] }] },
              { $size: "$technician_contributions" },
              { $add: [1, { $size: { $ifNull: ["$other_technicians", []] } }] },
            ],
          }, 0] } },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$record_count" },
          total_duration_minutes: { $sum: "$total_duration_minutes" },
          technician_duration_minutes: { $sum: "$technician_duration_minutes" },
          missing_duration: { $sum: "$missing_duration" },
          technician_tasks: { $sum: "$technician_tasks" },
        },
      },
    ]).toArray(),
  ]);
  const technicianById = new Map(activeTechnicians.map((technician) => [technician.id, technician]));
  const technicianByName = new Map(activeTechnicians.map((technician) => [normalizeTechnicianName(technician.full_name), technician]));

  const totalRow = totals[0] || { total: 0, thisCount: 0, lastCount: 0 };
  const periodRow = periodTotals[0] || { total: 0, total_duration_minutes: 0, technician_duration_minutes: 0, missing_duration: 0, technician_tasks: 0 };
  type TechnicianAggregate = { technician: string; technician_type: "mekanik" | "elektromekanik"; responsible_count: number; support_count: number; responsible_duration_minutes: number; support_duration_minutes: number };
  const technicianMap = new Map<string, TechnicianAggregate>();
  function canonicalTechnician(row: TechnicianAggregateRow): { key: string; name: string; technician_type: "mekanik" | "elektromekanik" } {
    const id = row?._id != null ? String(row._id) : "";
    const byId = id ? technicianById.get(id) : undefined;
    const byName = technicianByName.get(normalizeTechnicianName(row?.technician));
    const canonical = byId || byName;
    return {
      key: canonical?.id || id || normalizeTechnicianName(row?.technician) || "unknown",
      name: canonical?.full_name || (typeof row?.technician === "string" && row.technician.trim() ? row.technician.trim() : "Bilinmeyen"),
      technician_type: row?.technician_type === "elektromekanik" || row?.technician_type === "mekanik" ? row.technician_type : canonical?.technician_type || normalizeTechnicianType(row?.technician_type),
    };
  }
  function mergeTechnicianRow(row: TechnicianAggregateRow, kind: "responsible" | "support") {
    const canonical = canonicalTechnician(row);
    const current = technicianMap.get(canonical.key) || { technician: canonical.name, technician_type: canonical.technician_type, responsible_count: 0, support_count: 0, responsible_duration_minutes: 0, support_duration_minutes: 0 };
    current.technician = canonical.name;
    current.technician_type = canonical.technician_type;
    if (kind === "responsible") {
      current.responsible_count += Number(row.responsible_count || 0);
      current.responsible_duration_minutes += Number(row.responsible_duration_minutes || 0);
    } else {
      current.support_count += Number(row.support_count || 0);
      current.support_duration_minutes += Number(row.support_duration_minutes || 0);
    }
    technicianMap.set(canonical.key, current);
  }
  responsibleStaff.forEach((row) => mergeTechnicianRow(row, "responsible"));
  supportStaff.forEach((row) => mergeTechnicianRow(row, "support"));
  const allTechnicianRows = [...technicianMap.entries()]
    .map(([technician_id, row]) => ({ technician_id, technician: row.technician, technician_type: row.technician_type, technician_type_label: TECHNICIAN_TYPE_LABELS[row.technician_type], responsible_count: row.responsible_count, support_count: row.support_count, total_count: row.responsible_count + row.support_count, responsible_duration_minutes: row.responsible_duration_minutes, support_duration_minutes: row.support_duration_minutes, total_duration_minutes: row.responsible_duration_minutes + row.support_duration_minutes, average_duration_minutes: row.responsible_count + row.support_count ? Math.round((row.responsible_duration_minutes + row.support_duration_minutes) / (row.responsible_count + row.support_count)) : 0 }));
  const byTechnician = sortTechnicianSummary(allTechnicianRows);
  const technicianTypeTotals = new Map<string, { technician_type: "mekanik" | "elektromekanik"; technician_type_label: string; technician_count: number; responsible_count: number; support_count: number; total_count: number; total_duration_minutes: number }>();
  allTechnicianRows.forEach((row) => {
    const current = technicianTypeTotals.get(row.technician_type) || { technician_type: row.technician_type, technician_type_label: TECHNICIAN_TYPE_LABELS[row.technician_type], technician_count: 0, responsible_count: 0, support_count: 0, total_count: 0, total_duration_minutes: 0 };
    current.technician_count += 1;
    current.responsible_count += row.responsible_count;
    current.support_count += row.support_count;
    current.total_count += row.total_count;
    current.total_duration_minutes += row.total_duration_minutes;
    technicianTypeTotals.set(row.technician_type, current);
  });
  const byTechnicianType = [...technicianTypeTotals.values()].sort((a, b) => b.total_count - a.total_count || a.technician_type.localeCompare(b.technician_type, "tr"));
  const payload: Record<string, unknown> = {
    monthly: monthly.map((row) => ({ month: row._id, count: row.count })),
    byEngine: byEngine.map((row) => ({ engine_id: row._id || null, engine: row.engine || "Bilinmeyen", count: row.count })),
    byType: byType.map((row) => ({ type: row._id || "Bilinmeyen", count: row.count })),
    byTechnician,
    byTechnicianType,
    total: totalRow.total || 0,
    thisCount: totalRow.thisCount || 0,
    lastCount: totalRow.lastCount || 0,
    periodTotal: periodRow.total || 0,
    periodDurationMinutes: periodRow.total_duration_minutes || 0,
    periodTechnicianDurationMinutes: periodRow.technician_duration_minutes || 0,
    periodMissingDuration: periodRow.missing_duration || 0,
    periodTechnicianTasks: periodRow.technician_tasks || 0,
  };
  analyticsCache.set(enginePeriod, { expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS, value: payload });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store", "X-Analytics-Cache": "MISS" } });
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/analytics/summary", () => getAnalyticsSummary(req), { request: req });
}
