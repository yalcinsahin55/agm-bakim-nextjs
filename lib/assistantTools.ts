import type { Db } from "mongodb";
import { buildItems, type PanelItem } from "@/lib/status";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName, normalizeTechnicianType, TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import type { AssistantPeriod, AssistantQuery, AssistantIntent, AssistantStatusFilter } from "@/lib/assistantPolicy";
import { enginesCollection, maintenanceTypesCollection, recordsCollection, pressureReadingsCollection, oilAnalysesCollection, equipmentInfoCollection, notificationsCollection } from "@/lib/dbCollections";
import { buildMaintenanceForecastRows, dateKeyLabel, summarizeMaintenanceForecast, validForecastYear, validMaintenancePeriodHours } from "@/lib/maintenanceForecast";

export interface AssistantToolResponse {
  intent: AssistantIntent;
  period: AssistantPeriod;
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

type SummaryTotalsRow = { total?: number; external?: number; duration?: number };
type SummaryEngineRow = { _id?: string; engine?: string; count?: number; type_stats?: Array<{ type?: string; count?: number }> };
type SummaryTypeRow = { _id?: string; count?: number; engines?: Array<{ engine_id?: string; engine?: string; count?: number }> };
type SummaryAggregateRow = { totals?: SummaryTotalsRow[]; byEngine?: SummaryEngineRow[]; byType?: SummaryTypeRow[] };
type TechnicianAggregateRow = { _id?: unknown; technician?: string; technician_type?: unknown; count?: number; duration?: number };
type TechnicianDetailTypeRow = { _id?: string; count?: number };
type TechnicianDetailEngineRow = { _id?: { engine_id?: string; engine?: string }; count?: number };
type ExternalServiceAggregateRow = { totals?: Array<{ count?: number; duration?: number }>; services?: Array<{ _id?: string; count?: number; duration?: number }>; engines?: Array<{ _id?: string; engine?: string; count?: number }> };

function periodStart(period: AssistantPeriod): Date | null {
  const now = new Date();
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === "3months") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  if (period === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

function periodLabel(query: AssistantQuery): string {
  if (query.dateRange) return `${dateKeyLabel(query.dateRange.from)} - ${dateKeyLabel(query.dateRange.to)}`;
  return query.period === "month" ? "bu ay" : query.period === "3months" ? "son üç ay" : query.period === "year" ? "bu yıl" : "tüm dönem";
}

function dateKeyStart(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function periodMatch(query: AssistantQuery): Record<string, unknown> {
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (from && to) {
      to.setUTCDate(to.getUTCDate() + 1);
      const createdAtRange = { created_at: { $gte: from, $lt: to } };
      return {
        $and: [{
          $or: [
            { maintenance_start_at: { $gte: from, $lt: to } },
            { $and: [{ $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }] }, createdAtRange] },
          ],
        }],
      };
    }
  }
  const start = periodStart(query.period);
  return start ? { created_at: { $gte: start } } : {};
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function externalExpression() {
  return {
    $or: [
      { $eq: ["$technician_source", "external_service"] },
      { $eq: ["$technician_id", EXTERNAL_SERVICE_TECHNICIAN_ID] },
    ],
  };
}

async function internalRecordMatch(db: Db, query: AssistantQuery, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const base = await buildRecordMatch(db, query, extra);
  return {
    $and: [
      base,
      { technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } },
    ],
  };
}

async function resolveMaintenanceType(db: Db, query: AssistantQuery) {
  if (!query.maintenanceTypeQuery) return null;
  const value = query.maintenanceTypeQuery.trim();
  if (!value) return null;
  const escaped = escapeRegex(value);
  return maintenanceTypesCollection(db).findOne(
    { is_deleted: { $ne: true }, $or: [{ key: value }, { label: { $regex: escaped, $options: "i" } }] },
    { projection: { key: 1, label: 1 } },
  );
}

async function statusPairs(db: Db, status: AssistantStatusFilter | undefined): Promise<Array<{ engine_id: string; type_key: string }>> {
  if (!status) return [];
  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  const targetStatus = status === "overdue" ? "gecikmis" : status === "critical" ? "kritik" : status === "upcoming" ? "yaklasiyor" : "normal";
  return buildItems(engines, types)
    .filter((item) => item.status === targetStatus)
    .map((item) => ({ engine_id: item.engine_id, type_key: item.type_key }));
}

async function buildRecordMatch(db: Db, query: AssistantQuery, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const clauses: Array<Record<string, unknown>> = [];
  const timeMatch = periodMatch(query);
  if (Object.keys(timeMatch).length > 0) clauses.push(timeMatch);
  if (Object.keys(extra).length > 0) clauses.push(extra);
  if (query.engineQuery) {
    const engine = await findEngine(db, query.engineQuery);
    clauses.push({ engine_id: engine ? String(engine._id) : "__assistant_no_matching_engine__" });
  }
  if (query.sourceFilter === "external_service") clauses.push({ $or: [{ technician_source: "external_service" }, { technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID }] });
  if (query.sourceFilter === "internal") clauses.push({ technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } });
  if (query.hourRange && (query.hourRange.min !== undefined || query.hourRange.max !== undefined)) clauses.push({ hour_at_completion: { ...(query.hourRange.min !== undefined ? { $gte: query.hourRange.min } : {}), ...(query.hourRange.max !== undefined ? { $lte: query.hourRange.max } : {}) } });
  if (query.durationRange && (query.durationRange.min !== undefined || query.durationRange.max !== undefined)) clauses.push({ maintenance_duration_minutes: { ...(query.durationRange.min !== undefined ? { $gte: query.durationRange.min } : {}), ...(query.durationRange.max !== undefined ? { $lte: query.durationRange.max } : {}) } });
  if (query.evidenceFilter === "photo") clauses.push({ $or: [{ "photos.0": { $exists: true } }, { "photos_b64.0": { $exists: true } }] });
  if (query.evidenceFilter === "video") clauses.push({ "videos.0": { $exists: true } });
  if (query.evidenceFilter === "note") clauses.push({ $or: [{ note: { $exists: true, $nin: [null, ""] } }, { technician_note: { $exists: true, $nin: [null, ""] } }] });
  if (query.evidenceFilter === "checklist") clauses.push({ "checklist.0": { $exists: true } });
  if (query.teamOnly) clauses.push({ $or: [{ "other_technicians.0": { $exists: true } }, { "other_technician_ids.0": { $exists: true } }] });
  if (query.recordFilters?.includes("backdated")) clauses.push({ backdated: true });
  if (query.recordFilters?.includes("missing_time")) clauses.push({ $or: [
    { maintenance_start_at: { $exists: false } },
    { maintenance_start_at: null },
    { maintenance_end_at: { $exists: false } },
    { maintenance_end_at: null },
  ] });
  if (query.recordFilters?.includes("unconfirmed")) clauses.push({ manager_confirmation_status: "pending" });
  const type = await resolveMaintenanceType(db, query);
  if (query.maintenanceTypeQuery) clauses.push(type ? { $or: [{ type_key: type.key }, { type_label: type.label }] } : { type_key: "__assistant_no_matching_type__" });
  if (query.statusFilter) {
    const pairs = await statusPairs(db, query.statusFilter);
    clauses.push(pairs.length ? { $or: pairs } : { engine_id: "__assistant_no_matching_status__" });
  }
  return clauses.length ? { $and: clauses } : {};
}

function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value || 0));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remaining = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (remaining || parts.length === 0) parts.push(`${remaining} dakika`);
  return parts.join(" ");
}

async function getMaintenanceSummary(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const records = recordsCollection(db);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match = await buildRecordMatch(db, query);
  const [row] = await records.aggregate<SummaryAggregateRow>([
    { $match: match },
    {
      $facet: {
        totals: [
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
              external_record_count: { $sum: { $cond: [externalExpression(), 1, 0] } },
              duration: { $max: { $ifNull: ["$maintenance_duration_minutes", 0] } },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$record_count" },
              external: { $sum: "$external_record_count" },
              duration: { $sum: "$duration" },
            },
          },
        ],
        byEngine: [
          { $group: { _id: { engine_id: "$engine_id", engine: "$engine_name", type: "$type_label" }, count: { $sum: 1 } } },
          { $group: { _id: "$_id.engine_id", engine: { $first: "$_id.engine" }, count: { $sum: "$count" }, type_stats: { $push: { type: "$_id.type", count: "$count" } } } },
          { $sort: { count: -1, engine: 1 } },
          { $limit: 8 },
        ],
        byType: [
          { $group: { _id: { type: "$type_label", engine_id: "$engine_id", engine: "$engine_name" }, count: { $sum: 1 } } },
          { $group: { _id: "$_id.type", count: { $sum: "$count" }, engines: { $push: { engine_id: "$_id.engine_id", engine: "$_id.engine", count: "$count" } } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 8 },
        ],
      },
    },
  ]).toArray();
  const totals = row?.totals?.[0] || { total: 0, external: 0, duration: 0 };
  const total = Number(totals.total || 0);
  const external = Number(totals.external || 0);
  return {
    intent: "summary",
    period: query.period,
    title: "Bakım özeti",
    summary: `${periodLabel(query)} ${total} bakım kaydı bulundu. Bunun ${external} tanesi dış hizmet kaydıdır.`,
    data: {
      period: query.period,
      date_range: query.dateRange || null,
      filters: { engine: selectedEngine?.name || query.engineQuery || null, engine_id: selectedEngine ? String(selectedEngine._id) : null, maintenance_type: query.maintenanceTypeQuery || null, source: query.sourceFilter || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null, team_only: Boolean(query.teamOnly) },
      total_records: total,
      external_service_records: external,
      recorded_duration_minutes: Number(totals.duration || 0),
      recorded_duration_text: formatMinutes(Number(totals.duration || 0)),
      by_engine: (row?.byEngine || []).map((item) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0), type_stats: (item.type_stats || []).filter((type) => Boolean(type.type)).sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.type).localeCompare(String(b.type), "tr")) })),
      by_type: (row?.byType || []).map((item) => ({ type: item._id || "Bilinmeyen", count: Number(item.count || 0), engines: (item.engines || []).filter((engine) => Boolean(engine.engine_id)).sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.engine).localeCompare(String(b.engine), "tr")) })),
    },
  };
}

async function getOverdueMaintenance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  const items = buildItems(engines, types);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const selectedType = await resolveMaintenanceType(db, query);
  const overdue = items
    .filter((item) => item.status === "gecikmis")
    .filter((item) => !query.engineQuery || (selectedEngine && item.engine_id === String(selectedEngine._id)))
    .filter((item) => !query.maintenanceTypeQuery || (selectedType && item.type_key === String(selectedType.key)))
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 20);
  return {
    intent: "overdue",
    period: "all",
    title: "Gecikmiş bakımlar",
    summary: overdue.length ? `${overdue.length} gecikmiş bakım bulundu.` : "Şu anda gecikmiş bakım bulunamadı.",
    data: {
      count: overdue.length,
      filters: { engine: selectedEngine ? selectedEngine.name : query.engineQuery || null, maintenance_type: selectedType ? selectedType.label : query.maintenanceTypeQuery || null, status: "overdue", record_filters: query.recordFilters || [] },
      items: overdue.map((item: PanelItem) => ({
        engine_id: item.engine_id,
        engine: item.engine_name,
        type_key: item.type_key,
        type: item.type_label,
        engine_hours: item.engine_hours,
        last_hour: item.last_hour,
        period_hours: item.period,
        status: item.status,
        remaining_hours: Math.round(item.remaining),
        overdue_hours: Math.max(0, Math.round(Math.abs(item.remaining))),
      })),
    },
  };
}

async function getMaintenanceForecast(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  const targetYear = validForecastYear(query.targetYear);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const selectedType = await resolveMaintenanceType(db, query);
  const targetStatus = query.statusFilter === "overdue" ? "gecikmis" : query.statusFilter === "critical" ? "kritik" : query.statusFilter === "upcoming" ? "yaklasiyor" : query.statusFilter === "normal" ? "normal" : null;
  // Forecast soruları varsayılan olarak gecikmiş backlog’u da içerir; “gecikmişleri de göster” tüm planı gecikmişlerle daraltmamalıdır.
  const scheduledStatus = targetStatus === "gecikmis" ? null : targetStatus;
  const targetPeriod = validMaintenancePeriodHours(query.maintenancePeriodHours);

  let forecasts = buildMaintenanceForecastRows(engines, types, {
    targetYear,
    maintenancePeriodHours: targetPeriod,
    engineId: selectedEngine ? String(selectedEngine._id) : undefined,
    typeLabel: selectedType?.label || query.maintenanceTypeQuery,
  });
  if (scheduledStatus) forecasts = forecasts.filter((item) => item.status === scheduledStatus);

  const summary = summarizeMaintenanceForecast(forecasts, targetYear);
  const targetLabel = targetYear ? `${targetYear} yılına kadar` : "mevcut tahmini plan";
  const periodLabel = targetPeriod ? `${targetPeriod.toLocaleString("tr-TR")} saatlik bakım` : "bakım planı";
  return {
    intent: "maintenance_forecast",
    period: "all",
    title: targetYear ? `${targetYear} bakım planı ve tamamlanmamış bakımlar` : `${periodLabel} ve tamamlanmamış bakımlar`,
    summary: targetPeriod
      ? `${periodLabel} için toplam ${summary.total} plan satırı bulundu. ${summary.overdue_count} tanesi tamamlanmamış/gecikmiş, ${summary.scheduled_count} tanesi ${targetLabel} içinde tahmini plan. ${targetYear ? `${targetYear} yılına denk gelen ${summary.target_year_count} adet.` : ""}`
      : `${summary.current_date} itibarıyla ${summary.overdue_count} tamamlanmamış/gecikmiş bakım var. ${targetLabel} içinde tahmini ${summary.scheduled_count} bakım daha görünüyor; ${targetYear ? `${targetYear} yılına denk geleni ${summary.target_year_count} adet${summary.before_target_year_count ? `, hedef yıldan önce planlananı ${summary.before_target_year_count} adet` : ""}.` : "Mevcut her bakım türü için bir sonraki tahmini bakım gösteriliyor."}`,
    data: {
      ...summary,
      filters: { target_year: targetYear || null, maintenance_period_hours: targetPeriod || null, engine: selectedEngine?.name || query.engineQuery || null, engine_id: selectedEngine ? String(selectedEngine._id) : null, maintenance_type: selectedType?.label || query.maintenanceTypeQuery || null, status: query.statusFilter || null },
      items: forecasts,
    },
  };
}

async function findEngine(db: Db, engineQuery: string) {
  const value = engineQuery.trim();
  const escaped = escapeRegex(value);
  const engines = enginesCollection(db);
  const projection = { projection: { _id: 1, name: 1, hours: 1 } };
  const exact = await engines.findOne(
    { $or: [{ _id: value }, { name: { $regex: `^${escaped}$`, $options: "i" } }] },
    projection,
  );
  if (exact) return exact;
  const agmName = value.match(/^agm[-\s]?(\d{1,3})$/iu);
  if (agmName) {
    const normalizedAgm = await engines.findOne({ name: { $regex: `^agm[-\\s]?${agmName[1]}$`, $options: "i" } }, projection);
    if (normalizedAgm) return normalizedAgm;
  }
  return engines.findOne({ name: { $regex: escaped, $options: "i" } }, projection);
}

async function getEngineMaintenanceHistory(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const engine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  if (query.engineQuery && !engine) {
    return { intent: "engine_history", period: query.period, title: "Motor bakım geçmişi", summary: `“${query.engineQuery}” ile eşleşen motor bulunamadı.`, data: { records: [] } };
  }
  const match = await buildRecordMatch(db, query, engine ? { engine_id: String(engine._id) } : {});
  const records = await recordsCollection(db).find(
    match,
    {
      projection: {
        _id: 1, engine_id: 1, engine_name: 1, type_label: 1, hour_at_completion: 1, technician_name: 1, technician_source: 1,
        external_service_name: 1, other_technicians: 1, maintenance_start_at: 1, maintenance_end_at: 1,
        maintenance_duration_minutes: 1, created_at: 1,
      },
    },
  ).sort({ maintenance_start_at: -1, created_at: -1 }).limit(20).toArray();
  const safeRecords = records.map((record) => ({
    id: String(record._id),
    engine_id: record.engine_id || null,
    engine_name: record.engine_name || null,
    type: record.type_label || "Bilinmeyen",
    hour_at_completion: Number(record.hour_at_completion || 0),
    technician: record.technician_name || "Bilinmeyen",
    technician_source: record.technician_source || "internal",
    external_service_name: record.external_service_name || null,
    other_technicians: Array.isArray(record.other_technicians) ? record.other_technicians.map((item) => item.full_name).filter(Boolean).slice(0, 10) : [],
    start_at: record.maintenance_start_at || null,
    end_at: record.maintenance_end_at || null,
    duration_minutes: Number(record.maintenance_duration_minutes || 0),
    created_at: record.maintenance_start_at || record.created_at || null,
  }));
  return {
    intent: "engine_history",
    period: query.period,
    title: engine ? `${engine.name} bakım geçmişi` : "Motor bakım geçmişi",
    summary: engine ? `${engine.name} için ${periodLabel(query)} döneminde ${safeRecords.length} bakım kaydı bulundu.` : `${periodLabel(query)} tüm motorlarda ${safeRecords.length} bakım kaydı bulundu.`,
    data: { engine_id: engine ? String(engine._id) : null, engine: engine?.name || null, current_hours: engine ? Number(engine.hours || 0) : null, date_range: query.dateRange || null, filters: { source: query.sourceFilter || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null }, records: safeRecords },
  };
}

async function getTechnicianPerformance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const technicians = await listActiveTechnicians(db);
  const normalizedQuestion = normalizeTechnicianName(query.question);
  const selected = technicians.find((technician) => normalizedQuestion.includes(normalizeTechnicianName(technician.full_name)));
  const records = recordsCollection(db);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match = await internalRecordMatch(db, query, query.engineQuery ? { engine_id: selectedEngine ? String(selectedEngine._id) : "__assistant_no_matching_engine__" } : {});
  const includeResponsible = query.technicianRole !== "support";
  const includeSupport = query.technicianRole !== "responsible";
  const contributionFallback = {
    $concatArrays: [
      [{ id: "$technician_id", full_name: "$technician_name", technician_type: { $ifNull: ["$technician_type", "mekanik"] }, contribution_role: "responsible", duration_minutes: { $ifNull: ["$maintenance_duration_minutes", 0] } }],
      { $map: { input: { $ifNull: ["$other_technicians", []] }, as: "technician", in: { id: "$$technician.id", full_name: "$$technician.full_name", technician_type: { $ifNull: ["$$technician.technician_type", "mekanik"] }, contribution_role: "support", duration_minutes: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
    ],
  };
  const contributionProject = {
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
        contributionFallback,
      ],
    },
  };
  const contributionMatch = (role: "responsible" | "support") => ({ $match: { "contributions.contribution_role": role } });
  const [responsible, support] = await Promise.all([
    includeResponsible ? records.aggregate<TechnicianAggregateRow>([
      { $match: match },
      { $project: contributionProject },
      { $unwind: "$contributions" },
      contributionMatch("responsible"),
      { $group: { _id: { group_key: "$group_key", technician_id: "$contributions.id" }, technician: { $first: "$contributions.full_name" }, technician_type: { $first: "$contributions.technician_type" }, duration: { $max: { $ifNull: ["$contributions.duration_minutes", 0] } } } },
      { $group: { _id: "$_id.technician_id", technician: { $first: "$technician" }, technician_type: { $first: "$technician_type" }, count: { $sum: 1 }, duration: { $sum: "$duration" } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray() : Promise.resolve([]),
    includeSupport ? records.aggregate<TechnicianAggregateRow>([
      { $match: match },
      { $project: contributionProject },
      { $unwind: "$contributions" },
      contributionMatch("support"),
      { $group: { _id: { group_key: "$group_key", technician_id: "$contributions.id" }, technician: { $first: "$contributions.full_name" }, technician_type: { $first: "$contributions.technician_type" }, duration: { $max: { $ifNull: ["$contributions.duration_minutes", 0] } } } },
      { $group: { _id: "$_id.technician_id", technician: { $first: "$technician" }, technician_type: { $first: "$technician_type" }, count: { $sum: 1 }, duration: { $sum: "$duration" } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray() : Promise.resolve([]),
  ]);
  const rows = new Map<string, { technician_id: string; technician: string; technician_type: "mekanik" | "elektromekanik"; responsible_count: number; support_count: number; duration_minutes: number; average_minutes: number }>();
  const merge = (item: TechnicianAggregateRow, kind: "responsible" | "support") => {
    const id = String(item._id || "unknown");
    const current = rows.get(id) || { technician_id: id, technician: item.technician || "Bilinmeyen", technician_type: normalizeTechnicianType(item.technician_type), responsible_count: 0, support_count: 0, duration_minutes: 0, average_minutes: 0 };
    current.technician = item.technician || current.technician;
    if (item.technician_type === "mekanik" || item.technician_type === "elektromekanik") current.technician_type = item.technician_type;
    if (kind === "responsible") current.responsible_count += Number(item.count || 0);
    else current.support_count += Number(item.count || 0);
    current.duration_minutes += Number(item.duration || 0);
    current.average_minutes = current.responsible_count + current.support_count ? Math.round(current.duration_minutes / (current.responsible_count + current.support_count)) : 0;
    rows.set(id, current);
  };
  responsible.forEach((item) => merge(item, "responsible"));
  support.forEach((item) => merge(item, "support"));
  let resultRows = [...rows.values()].sort((a, b) => b.responsible_count + b.support_count - (a.responsible_count + a.support_count) || a.technician.localeCompare(b.technician, "tr"));
  if (selected) resultRows = resultRows.filter((item) => item.technician_id === selected.id || normalizeTechnicianName(item.technician) === normalizeTechnicianName(selected.full_name));
  let activities: Array<Record<string, unknown>> = [];
  let activityByType: Array<Record<string, unknown>> = [];
  let activityByEngine: Array<Record<string, unknown>> = [];
  if (selected) {
    const selectedName = escapeRegex(selected.full_name);
    const participation = query.technicianRole === "support"
      ? { $or: [{ "other_technicians.id": selected.id }, { "other_technicians.full_name": { $regex: selectedName, $options: "i" } }] }
      : query.technicianRole === "responsible"
        ? { $or: [{ technician_id: selected.id }, { technician_name: { $regex: selectedName, $options: "i" } }] }
        : { $or: [{ technician_id: selected.id }, { "other_technicians.id": selected.id }, { technician_name: { $regex: selectedName, $options: "i" } }, { "other_technicians.full_name": { $regex: selectedName, $options: "i" } }] };
    const selectedMatch = { $and: [match, participation] };
    const selectedRecords = await records.find(selectedMatch, {
      projection: { _id: 1, group_id: 1, engine_id: 1, engine_name: 1, type_label: 1, technician_id: 1, technician_name: 1, technician_type: 1, other_technicians: 1, technician_contributions: 1, maintenance_start_at: 1, maintenance_duration_minutes: 1, created_at: 1 },
    }).sort({ maintenance_start_at: -1, created_at: -1 }).limit(50).toArray();
    const typeCounts = new Map<string, number>();
    const typeEngineCounts = new Map<string, Map<string, { engine_id: string; engine: string; count: number }>>();
    const engineCounts = new Map<string, { engine_id: string; engine: string; count: number }>();
    const engineTypeCounts = new Map<string, Map<string, number>>();
    const activityGroups = new Map<string, { id: string; engine_id: string | null; engine: string; types: string[]; role: string; start_at: unknown; duration_minutes: number; created_at: unknown }>();
    selectedRecords.forEach((record) => {
      const contribution = Array.isArray(record.technician_contributions) ? record.technician_contributions.find((item) => String(item.id) === selected.id || normalizeTechnicianName(item.full_name) === normalizeTechnicianName(selected.full_name)) : null;
      const isResponsible = contribution ? contribution.contribution_role === "responsible" : String(record.technician_id) === selected.id || normalizeTechnicianName(record.technician_name) === normalizeTechnicianName(selected.full_name);
      const type = record.type_label || "Bilinmeyen";
      const engine = record.engine_name || "Bilinmeyen";
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      const engineKey = String(record.engine_id || engine);
      const engineRow = engineCounts.get(engineKey) || { engine_id: engineKey, engine, count: 0 };
      engineRow.count += 1;
      engineCounts.set(engineKey, engineRow);
      const typeEngines = typeEngineCounts.get(type) || new Map<string, { engine_id: string; engine: string; count: number }>();
      const typeEngineRow = typeEngines.get(engineKey) || { engine_id: engineKey, engine, count: 0 };
      typeEngineRow.count += 1;
      typeEngines.set(engineKey, typeEngineRow);
      typeEngineCounts.set(type, typeEngines);
      const engineTypes = engineTypeCounts.get(engineKey) || new Map<string, number>();
      engineTypes.set(type, (engineTypes.get(type) || 0) + 1);
      engineTypeCounts.set(engineKey, engineTypes);
      const groupKey = String(record.group_id || record._id);
      const activity = activityGroups.get(groupKey);
      const durationMinutes = Number(contribution?.duration_minutes ?? record.maintenance_duration_minutes ?? 0);
      if (activity) {
        if (!activity.types.includes(type)) activity.types.push(type);
        activity.duration_minutes = Math.max(activity.duration_minutes, durationMinutes);
      } else {
        activityGroups.set(groupKey, {
          id: groupKey,
          engine_id: record.engine_id || null,
          engine,
          types: [type],
          role: isResponsible ? "Sorumlu" : "Yardımcı",
          start_at: record.maintenance_start_at || null,
          duration_minutes: durationMinutes,
          created_at: record.maintenance_start_at || record.created_at || null,
        });
      }
    });
    activities = [...activityGroups.values()].map((activity) => ({ ...activity, type: activity.types.join(" + ") }));
    activityByType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).map(([type, count]) => ({ type, count, engines: [...(typeEngineCounts.get(type)?.values() || [])].sort((a, b) => b.count - a.count || a.engine.localeCompare(b.engine, "tr")) }));
    activityByEngine = [...engineCounts.values()].sort((a, b) => b.count - a.count || a.engine.localeCompare(b.engine, "tr")).map((engine) => ({ ...engine, type_stats: [...(engineTypeCounts.get(engine.engine_id)?.entries() || [])].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "tr")) }));
  }
  const technicianDetails = await Promise.all(resultRows.slice(0, 12).map(async (technician) => {
    if (!technician.technician_id || technician.technician_id === "unknown") return { technician_id: technician.technician_id, by_type: [], by_engine: [] };
    const detailMatch = { $and: [match, { $or: [{ technician_id: technician.technician_id }, { "other_technicians.id": technician.technician_id }] }] };
    const [detail] = await records.aggregate<{ byType?: TechnicianDetailTypeRow[]; byEngine?: TechnicianDetailEngineRow[] }>([
      { $match: detailMatch },
      { $facet: {
        byType: [{ $group: { _id: "$type_label", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }],
        byEngine: [
          { $set: { __maintenance_group_key: { $cond: [{ $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] }, "$group_id", { $toString: "$_id" }] } } },
          { $group: { _id: { engine_id: "$engine_id", engine: "$engine_name", group_key: "$__maintenance_group_key" } } },
          { $group: { _id: { engine_id: "$_id.engine_id", engine: "$_id.engine" }, count: { $sum: 1 } } },
          { $sort: { count: -1, "_id.engine": 1 } },
          { $limit: 20 },
        ],
      } },
    ]).toArray();
    return {
      technician_id: technician.technician_id,
      technician_type: technician.technician_type,
      technician_type_label: TECHNICIAN_TYPE_LABELS[technician.technician_type],
      by_type: (detail?.byType || []).map((item) => ({ type: item._id || "Bilinmeyen", count: Number(item.count || 0) })),
      by_engine: (detail?.byEngine || []).map((item) => ({ engine_id: item._id?.engine_id || null, engine: item._id?.engine || "Bilinmeyen", count: Number(item.count || 0) })),
    };
  }));
  const totalTasks = resultRows.reduce((sum, item) => sum + item.responsible_count + item.support_count, 0);
  const totalResponsibleTasks = resultRows.reduce((sum, item) => sum + item.responsible_count, 0);
  const totalSupportTasks = resultRows.reduce((sum, item) => sum + item.support_count, 0);
  const totalDuration = resultRows.reduce((sum, item) => sum + item.duration_minutes, 0);
  const topTechnician = resultRows[0];
  const selectedSummary = selected
    ? {
      id: selected.id,
      full_name: selected.full_name,
      technician_type: selected.technician_type,
      responsible_tasks: resultRows[0]?.responsible_count || 0,
      support_tasks: resultRows[0]?.support_count || 0,
      total_tasks: totalTasks,
      duration_minutes: totalDuration,
      duration_text: formatMinutes(totalDuration),
    }
    : null;
  return {
    intent: "technician_performance",
    period: query.period,
    title: selected ? `${selected.full_name} teknisyen özeti` : "Teknisyen performans özeti",
    summary: selected
      ? `${selected.full_name}, ${periodLabel(query)} döneminde kayıtlara göre toplam ${formatMinutes(totalDuration)} çalıştı. ${totalTasks} görevde yer aldı; ${resultRows[0]?.responsible_count || 0} sorumlu, ${resultRows[0]?.support_count || 0} yardımcı görev.`
      : `${periodLabel(query)} ${totalTasks} teknisyen görevi ve ${formatMinutes(totalDuration)} toplam katkı süresi bulundu.${topTechnician ? ` En çok görev alan teknisyen: ${topTechnician.technician} (${topTechnician.responsible_count + topTechnician.support_count} görev).` : ""}`,
    data: { period: query.period, date_range: query.dateRange || null, filters: { engine: selectedEngine ? selectedEngine.name : query.engineQuery || null, maintenance_type: query.maintenanceTypeQuery || null, role: query.technicianRole || "any", source: "internal", evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null, team_only: Boolean(query.teamOnly) }, selected_technician: selectedSummary, total_tasks: totalTasks, total_responsible_tasks: totalResponsibleTasks, total_support_tasks: totalSupportTasks, total_duration_minutes: totalDuration, total_duration_text: formatMinutes(totalDuration), top_technician: topTechnician ? { id: topTechnician.technician_id, full_name: topTechnician.technician, total_tasks: topTechnician.responsible_count + topTechnician.support_count } : null, technicians: resultRows.slice(0, 12), technician_details: technicianDetails, activities, by_type: activityByType, by_engine: activityByEngine },
  };
}

async function getExternalServiceSummary(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const serviceFilter = query.serviceQuery ? { $or: [{ external_service_name: { $regex: escapeRegex(query.serviceQuery), $options: "i" } }, { technician_name: { $regex: escapeRegex(query.serviceQuery), $options: "i" } }] } : {};
  const match = await buildRecordMatch(db, query, { $and: [{ $or: [{ technician_source: "external_service" }, { technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID }] }, serviceFilter] });
  const [row] = await recordsCollection(db).aggregate<ExternalServiceAggregateRow>([
    { $match: match },
    {
      $facet: {
        totals: [
          { $set: { __maintenance_group_key: { $cond: [{ $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] }, "$group_id", { $toString: "$_id" }] } } },
          { $group: { _id: "$__maintenance_group_key", record_count: { $sum: 1 }, duration: { $max: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
          { $group: { _id: null, count: { $sum: "$record_count" }, duration: { $sum: "$duration" } } },
        ],
        services: [
          { $set: { __maintenance_group_key: { $cond: [{ $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] }, "$group_id", { $toString: "$_id" }] } } },
          { $group: { _id: { group_key: "$__maintenance_group_key", service: { $ifNull: ["$external_service_name", "$technician_name"] } }, record_count: { $sum: 1 }, duration: { $max: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
          { $group: { _id: "$_id.service", count: { $sum: "$record_count" }, duration: { $sum: "$duration" } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 12 },
        ],
        engines: [
          { $group: { _id: "$engine_id", engine: { $first: "$engine_name" }, count: { $sum: 1 } } },
          { $sort: { count: -1, engine: 1 } },
          { $limit: 12 },
        ],
      },
    },
  ]).toArray();
  const totals = row?.totals?.[0] || { count: 0, duration: 0 };
  return {
    intent: "external_service",
      period: query.period,
      title: "Dış hizmet bakım özeti",
    summary: `${periodLabel(query)} ${Number(totals.count || 0)} dış hizmet bakım kaydı bulundu.`,
    data: {
      count: Number(totals.count || 0),
      duration_minutes: Number(totals.duration || 0),
      duration_text: formatMinutes(Number(totals.duration || 0)),
      services: (row?.services || []).map((item) => ({ service: item._id || "Harici servis", count: Number(item.count || 0), duration_minutes: Number(item.duration || 0) })),
      filters: { service: query.serviceQuery || null, engine: query.engineQuery || null, maintenance_type: query.maintenanceTypeQuery || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null, team_only: Boolean(query.teamOnly) },
      engines: (row?.engines || []).map((item) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0) })),
    },
  };
}

function dataDateMatch(field: string, query: AssistantQuery): Record<string, unknown> {
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (from && to) {
      to.setUTCDate(to.getUTCDate() + 1);
      return { [field]: { $gte: from, $lt: to } };
    }
  }
  const start = periodStart(query.period);
  return start ? { [field]: { $gte: start } } : {};
}

function formatUnknownDate(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isDateInAssistantQuery(value: unknown, query: AssistantQuery): boolean {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return false;
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (!from || !to) return false;
    to.setUTCDate(to.getUTCDate() + 1);
    return date >= from && date < to;
  }
  const start = periodStart(query.period);
  return !start || date >= start;
}

async function getEngineData(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const filter = selectedEngine ? { _id: String(selectedEngine._id) } : query.engineQuery ? { _id: "__assistant_no_matching_engine__" } : {};
  const engines = await enginesCollection(db).find(filter, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).sort({ name: 1 }).limit(100).toArray();
  const rows = engines.map((engine) => {
    const allHistory = Array.isArray(engine.history) ? engine.history : [];
    const filteredHistory = query.dateRange || query.period !== "all" ? allHistory.filter((entry) => isDateInAssistantQuery(entry.date, query)).slice(-20) : allHistory.slice(-5);
    const history = filteredHistory.map((entry) => ({ date: formatUnknownDate(entry.date), hours: Number(entry.hours || 0), load_kw: Number(entry.load_kw || 0) }));
    return { engine_id: String(engine._id), engine: engine.name, hours: Number(engine.hours || 0), load_kw: Number(engine.load_kw || 0), updated_at: formatUnknownDate(engine.updated_at), latest_history: history.at(-1) || null, history };
  });
  return {
    intent: "engine_data",
    period: query.period,
    title: selectedEngine ? `${selectedEngine.name} motor bilgileri` : "Motor çalışma ve yük bilgileri",
    summary: selectedEngine ? `${selectedEngine.name} için çalışma saati, yük ve son saat geçmişi hazırlandı.` : `${rows.length} motorun çalışma saati, yük ve son saat geçmişi hazırlandı.`,
    data: { date_range: query.dateRange || null, engines: rows },
  };
}

async function getMaintenanceCatalog(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const selectedType = await resolveMaintenanceType(db, query);
  const filter: Record<string, unknown> = { is_deleted: { $ne: true } };
  if (selectedType) filter._id = selectedType.key;
  else if (query.maintenanceTypeQuery) filter._id = "__assistant_no_matching_type__";
  if (query.engineQuery && !selectedEngine) filter._id = "__assistant_no_matching_engine__";
  const types = await maintenanceTypesCollection(db).find(filter, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1, engine_states: 1 } }).sort({ label: 1 }).limit(200).toArray();
  const rows = types.map((type) => {
    const state = selectedEngine ? type.engine_states?.[String(selectedEngine._id)] : undefined;
    const applicable = selectedEngine ? type.engine_scope === "all" || Boolean(state) : undefined;
    return {
      type_key: String(type.key || type._id),
      type: type.label,
      default_period_hours: Number(type.default_period_hours || 0),
      engine_scope: type.engine_scope || "explicit",
      selected_engine: selectedEngine?.name || null,
      applicable_to_selected_engine: applicable,
      selected_engine_state: state ? { period_hours: Number(state.period_hours || 0), last_maintenance_hour: Number(state.last_maintenance_hour || 0), tracking_source: state.tracking_source || null } : null,
      work_domains: Array.isArray(type.work_domains) ? type.work_domains : [],
      allow_electromechanical_support: type.allow_electromechanical_support === true,
      allow_electromechanical_responsible: type.allow_electromechanical_responsible === true,
    };
  });
  return {
    intent: "maintenance_catalog",
    period: "all",
    title: selectedEngine ? `${selectedEngine.name} bakım kataloğu` : "Bakım türleri ve periyotları",
    summary: selectedEngine ? `${selectedEngine.name} için ${rows.filter((row) => row.applicable_to_selected_engine).length} uygulanabilir bakım türü bulundu.` : `${rows.length} aktif bakım türü ve periyot bilgisi bulundu.`,
    data: { engine_id: selectedEngine ? String(selectedEngine._id) : null, engine: selectedEngine?.name || null, types: rows },
  };
}

async function getPressureReadings(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match: Record<string, unknown> = { ...dataDateMatch("reading_date", query) };
  if (selectedEngine) match.engine_id = String(selectedEngine._id);
  else if (query.engineQuery) match.engine_id = "__assistant_no_matching_engine__";
  const readings = await pressureReadingsCollection(db).find(match, { projection: { _id: 1, engine_id: 1, engine_name: 1, reading_date: 1, load_kw: 1, pressure_bar: 1, status: 1, new_type: 1, note: 1, created_at: 1 } }).sort({ reading_date: -1, created_at: -1 }).limit(100).toArray();
  return {
    intent: "pressure_readings",
    period: query.period,
    title: selectedEngine ? `${selectedEngine.name} karter basınç okumaları` : "Karter basınç okumaları",
    summary: `${readings.length} basınç ölçümü bulundu.`,
    data: { date_range: query.dateRange || null, readings: readings.map((reading) => ({ id: String(reading._id), engine_id: reading.engine_id, engine: reading.engine_name, reading_date: formatUnknownDate(reading.reading_date), load_kw: reading.load_kw === null || reading.load_kw === undefined ? null : Number(reading.load_kw), pressure_bar: reading.pressure_bar === null || reading.pressure_bar === undefined ? null : Number(reading.pressure_bar), status: reading.status || null, new_type: reading.new_type === true, note: reading.note || null })) },
  };
}

async function getOilAnalysis(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match: Record<string, unknown> = { ...dataDateMatch("analysis_date", query) };
  if (selectedEngine) match.engine_id = String(selectedEngine._id);
  else if (query.engineQuery) match.engine_id = "__assistant_no_matching_engine__";
  const oilCollection = oilAnalysesCollection(db);
  const [analyses, base64PdfIds] = await Promise.all([
    oilCollection.find(match, { projection: { _id: 1, engine_id: 1, engine_name: 1, analysis_date: 1, result: 1, note: 1, pdf_url: 1, pdf_filename: 1, created_at: 1 } }).sort({ analysis_date: -1, created_at: -1 }).limit(100).toArray(),
    oilCollection.find({ ...match, pdf_b64: { $exists: true, $type: "string", $ne: "" } }, { projection: { _id: 1 } }).limit(1000).toArray(),
  ]);
  const base64PdfIdSet = new Set(base64PdfIds.map((item) => String(item._id)));
  return {
    intent: "oil_analysis",
    period: query.period,
    title: selectedEngine ? `${selectedEngine.name} yağ analizleri` : "Yağ analizleri",
    summary: `${analyses.length} yağ analizi bulundu. PDF dosyaları varsa sonuç satırından açılabilir.`,
    data: { date_range: query.dateRange || null, analyses: analyses.map((analysis) => { const hasPdf = Boolean(analysis.pdf_url) || base64PdfIdSet.has(String(analysis._id)); return { id: String(analysis._id), engine_id: analysis.engine_id, engine: analysis.engine_name, analysis_date: formatUnknownDate(analysis.analysis_date), result: analysis.result || null, note: analysis.note || null, pdf_filename: analysis.pdf_filename || null, has_pdf: hasPdf, pdf_href: hasPdf ? `/api/oil-analyses/${encodeURIComponent(String(analysis._id))}/file?inline=1` : null }; }) },
  };
}

async function getEquipmentInfo(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const filter = selectedEngine ? { engine_name: selectedEngine.name } : query.engineQuery ? { engine_name: "__assistant_no_matching_engine__" } : {};
  const infos = await equipmentInfoCollection(db).find(filter, { projection: { _id: 1, engine_name: 1, kaver_tipi: 1, hava_filtresi: 1, krankcase: 1, esanjor_tipi: 1, dungs: 1, radyator_tipi: 1, not: 1 } }).sort({ engine_name: 1 }).limit(100).toArray();
  return {
    intent: "equipment_info",
    period: "all",
    title: selectedEngine ? `${selectedEngine.name} teknik bilgi kartı` : "Motor teknik bilgi kartları",
    summary: `${infos.length} motor teknik bilgi kartı bulundu.`,
    data: { infos: infos.map((info) => ({ id: String(info._id), engine_name: info.engine_name, kaver_tipi: info.kaver_tipi || null, hava_filtresi: info.hava_filtresi || null, krankcase: info.krankcase || null, esanjor_tipi: info.esanjor_tipi || null, dungs: info.dungs || null, radyator_tipi: info.radyator_tipi || null, note: info.not || null })) },
  };
}

async function getTechnicianDirectory(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  let technicians = await listActiveTechnicians(db);
  if (query.technicianRole === "responsible") technicians = technicians.filter((technician) => technician.can_be_responsible);
  if (query.technicianRole === "support") technicians = technicians.filter((technician) => technician.can_be_support);
  return {
    intent: "technician_directory",
    period: "all",
    title: "Aktif teknisyen listesi",
    summary: `${technicians.length} aktif ve onaylı teknisyen bulundu.`,
    data: { technicians: technicians.map((technician) => ({ id: technician.id, full_name: technician.full_name, technician_type: technician.technician_type, technician_type_label: TECHNICIAN_TYPE_LABELS[technician.technician_type], can_be_responsible: technician.can_be_responsible, can_be_support: technician.can_be_support, allowed_work_domains: technician.allowed_work_domains })) },
  };
}

async function getMaintenanceHealth(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const selectedType = await resolveMaintenanceType(db, query);
  const statusMap: Record<string, PanelItem["status"]> = { overdue: "gecikmis", critical: "kritik", upcoming: "yaklasiyor", normal: "normal" };
  const requestedStatus = query.statusFilter ? statusMap[query.statusFilter] : undefined;
  const items = buildItems(engines, types)
    .filter((item) => !query.engineQuery || (selectedEngine && item.engine_id === String(selectedEngine._id)))
    .filter((item) => !query.maintenanceTypeQuery || (selectedType && item.type_key === String(selectedType.key)))
    .filter((item) => !requestedStatus || item.status === requestedStatus)
    .sort((a, b) => a.remaining - b.remaining || a.engine_name.localeCompare(b.engine_name, "tr"));
  const counts = items.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});
  return {
    intent: "maintenance_health",
    period: "all",
    title: selectedEngine ? `${selectedEngine.name} bakım sağlığı` : "Motor bakım sağlığı",
    summary: `${items.length} motor-bakım durumu bulundu: ${counts.gecikmis || 0} gecikmiş, ${counts.kritik || 0} kritik, ${counts.yaklasiyor || 0} yaklaşan, ${counts.normal || 0} normal.`,
    data: { counts, items: items.slice(0, 200).map((item) => ({ engine_id: item.engine_id, engine: item.engine_name, type_key: item.type_key, type: item.type_label, engine_hours: item.engine_hours, last_hour: item.last_hour, period_hours: item.period, remaining_hours: item.remaining, status: item.status })) },
  };
}

async function getNotificationSummary(db: Db, query: AssistantQuery, userId: string | undefined): Promise<AssistantToolResponse> {
  if (!userId) return { intent: "notification_summary", period: "all", title: "Bildirim özeti", summary: "Bildirimleri göstermek için oturum kullanıcısı bulunamadı.", data: { notifications: [], count: 0 } };
  const match: Record<string, unknown> = { user_id: userId };
  if (query.unreadOnly) match.read_at = null;
  const notificationCollection = notificationsCollection(db);
  const [totalCount, groupedCounts, notifications] = await Promise.all([
    notificationCollection.countDocuments(match),
    notificationCollection.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: { $ifNull: ["$status", "$type"] }, count: { $sum: 1 } } }]).toArray(),
    notificationCollection.find(match, { projection: { _id: 1, type: 1, status: 1, title: 1, message: 1, href: 1, read_at: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(100).toArray(),
  ]);
  const counts = groupedCounts.reduce<Record<string, number>>((result, item) => { const key = String(item._id || "system"); result[key] = Number(item.count || 0); return result; }, {});
  return {
    intent: "notification_summary",
    period: "all",
    title: query.unreadOnly ? "Okunmamış bildirimler" : "Bildirim özeti",
    summary: query.unreadOnly ? `${totalCount} okunmamış bildirim bulundu.` : `${totalCount} bildirim bulundu.`,
    data: { count: totalCount, displayed_count: notifications.length, counts, notifications: notifications.map((notification) => ({ id: String(notification._id), type: notification.type, status: notification.status, title: notification.title, message: notification.message, href: notification.href || null, read_at: formatUnknownDate(notification.read_at), created_at: formatUnknownDate(notification.created_at) })) },
  };
}

export async function runAssistantTool(db: Db, query: AssistantQuery, context: { userId?: string } = {}): Promise<AssistantToolResponse> {
  if (query.intent === "summary") return getMaintenanceSummary(db, query);
  if (query.intent === "overdue") return getOverdueMaintenance(db, query);
  if (query.intent === "engine_history") return getEngineMaintenanceHistory(db, query);
  if (query.intent === "technician_performance") return getTechnicianPerformance(db, query);
  if (query.intent === "external_service") return getExternalServiceSummary(db, query);
  if (query.intent === "maintenance_forecast") return getMaintenanceForecast(db, query);
  if (query.intent === "engine_data") return getEngineData(db, query);
  if (query.intent === "maintenance_catalog") return getMaintenanceCatalog(db, query);
  if (query.intent === "pressure_readings") return getPressureReadings(db, query);
  if (query.intent === "oil_analysis") return getOilAnalysis(db, query);
  if (query.intent === "equipment_info") return getEquipmentInfo(db, query);
  if (query.intent === "technician_directory") return getTechnicianDirectory(db, query);
  if (query.intent === "notification_summary") return getNotificationSummary(db, query, context.userId);
  if (query.intent === "maintenance_health") return getMaintenanceHealth(db, query);
  return {
    intent: "help",
    period: query.period,
    title: "Bakım Asistanı",
    summary: "Bakım kayıtları, motor çalışma verileri, planlar ve güvenli rapor alanları hakkında salt okunur bilgi verebilirim.",
    data: {
      examples: [
        "Bu ay kaç bakım yapıldı?",
        "AGM 7 çalışma saatleri ve yükü nedir?",
        "Bakım türleri ve periyotları neler?",
        "AGM 7 karter basıncı son ölçümleri neler?",
        "Son yağ analizlerini göster.",
        "Motor teknik bilgi kartları neler?",
        "Aktif teknisyenler kimler?",
        "Yalçın Şahin bu hafta ne kadar çalıştı?",
        "Yalçın Şahin hangi bakımlarda çalıştı?",
        "Okunmamış bildirimlerim hangileri?",
        "Motor bakım sağlığı ve kalan saatler nasıl?",
        "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
      ],
    },
  };
}
