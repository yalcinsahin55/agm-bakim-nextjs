import type { Db } from "mongodb";
import { type PanelItem } from "@/lib/status";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName, normalizeTechnicianType, TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import type { AssistantPeriod, AssistantQuery, AssistantIntent, AssistantStatusFilter } from "@/lib/assistantPolicy";
import { enginesCollection, maintenanceTypesCollection, recordsCollection, pressureReadingsCollection, oilAnalysesCollection, equipmentInfoCollection, notificationsCollection } from "@/lib/dbCollections";
import { buildMaintenanceForecastRows, dateKeyLabel, summarizeMaintenanceForecast, validForecastYear, validMaintenancePeriodHours } from "@/lib/maintenanceForecast";
import { isAllowedReportAttachmentUrl, isReportAttachmentId, isReportAttachmentMime } from "@/lib/reportAttachments";
import { getOrBuildMaintenancePanelServerPayload } from "@/lib/maintenancePanelServer";

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(Math.trunc(concurrency), 1), items.length);
  const runWorker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };
  if (workerCount > 0) await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export interface AssistantToolResponse {
  intent: AssistantIntent;
  period: AssistantPeriod;
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

type SummaryTotalsRow = { total?: number; unique_events?: number; external?: number; duration?: number };
type SummaryEngineRow = { _id?: string; engine?: string; count?: number; type_stats?: Array<{ type?: string; count?: number }> };
type SummaryTypeRow = { _id?: string; count?: number; engines?: Array<{ engine_id?: string; engine?: string; count?: number }> };
type SummaryDailyRow = { _id?: { date?: Date | string; engine_id?: string; engine?: string; group_key?: string }; types?: string[]; count?: number; duration?: number; source?: string };
type SummaryAggregateRow = { totals?: SummaryTotalsRow[]; byEngine?: SummaryEngineRow[]; byType?: SummaryTypeRow[]; daily?: SummaryDailyRow[] };
type TechnicianAggregateRow = { _id?: unknown; technician?: string; technician_type?: unknown; count?: number; duration?: number };
type TechnicianDetailTypeRow = { _id?: string; count?: number };
type TechnicianDetailEngineRow = { _id?: { engine_id?: string; engine?: string }; count?: number };
type ExternalServiceAggregateRow = { totals?: Array<{ count?: number; duration?: number }>; services?: Array<{ _id?: string; count?: number; duration?: number }>; engines?: Array<{ _id?: string; engine?: string; count?: number }> };
type ReportAttachmentRow = { id?: unknown; url?: unknown; filename?: unknown; mime?: unknown; size?: unknown; uploaded_at?: unknown };
type MaintenanceWorkRow = { total_duration_minutes: number; last_duration_minutes: number; completed_count: number; last_completed_at: string | null };

function currentTurkeyDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function periodStart(period: AssistantPeriod): Date | null {
  const today = currentTurkeyDateKey();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (period === "month") return new Date(Date.UTC(year, month, 1));
  if (period === "3months") return new Date(Date.UTC(year, month - 2, 1));
  if (period === "year") return new Date(Date.UTC(year, 0, 1));
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

function dateRangeClauses(field: "maintenance_start_at" | "created_at", from: Date, to?: Date): Array<Record<string, unknown>> {
  const dateRange: Record<string, unknown> = { $gte: from };
  if (to) dateRange.$lt = to;
  const isoRange: Record<string, unknown> = { $gte: from.toISOString() };
  if (to) isoRange.$lt = to.toISOString();
  return [{ [field]: dateRange }, { [field]: isoRange }];
}

function periodMatch(query: AssistantQuery): Record<string, unknown> {
  const buildRangeMatch = (from: Date, to?: Date): Record<string, unknown> => ({
    $or: [
      ...dateRangeClauses("maintenance_start_at", from, to),
      {
        $and: [
          { $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }] },
          { $or: dateRangeClauses("created_at", from, to) },
        ],
      },
    ],
  });
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (from && to) {
      to.setUTCDate(to.getUTCDate() + 1);
      return buildRangeMatch(from, to);
    }
  }
  const start = periodStart(query.period);
  return start ? buildRangeMatch(start) : {};
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
  const { items } = await getOrBuildMaintenancePanelServerPayload(db);
  const targetStatus = status === "overdue" ? "gecikmis" : status === "critical" ? "kritik" : status === "upcoming" ? "yaklasiyor" : "normal";
  return items
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
  if (query.excludedTypeLabels?.length) clauses.push({ type_label: { $nin: query.excludedTypeLabels.slice(0, 30) } });
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

function safeReportAttachments(recordId: unknown, value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const id = String(recordId || "");
  if (!id) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const attachment = candidate as ReportAttachmentRow;
    if (!isReportAttachmentId(attachment.id) || !isAllowedReportAttachmentUrl(attachment.url)) return [];
    const filename = typeof attachment.filename === "string" && attachment.filename.trim() ? attachment.filename : "rapor-eki";
    if (!isReportAttachmentMime(attachment.mime)) return [];
    const mime = attachment.mime;
    const size = typeof attachment.size === "number" && Number.isFinite(attachment.size) && attachment.size > 0 ? Math.min(20 * 1024 * 1024, Math.round(attachment.size)) : null;
    const uploadedAt = formatUnknownDate(attachment.uploaded_at);
    const attachmentId = String(attachment.id);
    const basePath = `/api/records/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`;
    return [{
      id: attachmentId,
      filename,
      mime,
      size,
      uploaded_at: uploadedAt,
      href: `${basePath}?inline=1`,
      download_href: `${basePath}?download=1`,
    }];
  });
}

function buildMaintenanceWorkIndex(records: Array<Record<string, unknown>>): Map<string, MaintenanceWorkRow> {
  const eventRows = new Map<string, { pairKey: string; duration: number; completedAt: string | null }>();
  records.forEach((record, recordIndex) => {
    const engineId = String(record.engine_id || "");
    const typeKey = String(record.type_key || record.type_label || "");
    if (!engineId || !typeKey) return;
    const pairKey = `${engineId}|${typeKey}`;
    const eventKey = `${pairKey}|${String(record.group_id || record._id || record.maintenance_start_at || record.created_at || recordIndex)}`;
    const duration = Math.max(0, Number(record.maintenance_duration_minutes || 0));
    const completedAt = formatUnknownDate(record.maintenance_start_at || record.created_at);
    const previous = eventRows.get(eventKey);
    if (!previous || duration >= previous.duration) eventRows.set(eventKey, { pairKey, duration, completedAt });
  });
  const index = new Map<string, MaintenanceWorkRow>();
  [...eventRows.values()].forEach((event) => {
    const current = index.get(event.pairKey) || { total_duration_minutes: 0, last_duration_minutes: 0, completed_count: 0, last_completed_at: null };
    current.total_duration_minutes += event.duration;
    current.completed_count += 1;
    if (!current.last_completed_at || (event.completedAt && event.completedAt > current.last_completed_at)) {
      current.last_completed_at = event.completedAt;
      current.last_duration_minutes = event.duration;
    }
    index.set(event.pairKey, current);
  });
  return index;
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
              unique_events: { $sum: 1 },
              external: { $sum: "$external_record_count" },
              duration: { $sum: "$duration" },
            },
          },
        ],
        byEngine: [
          { $group: { _id: { engine_id: "$engine_id", engine: "$engine_name", type: "$type_label" }, count: { $sum: 1 } } },
          { $group: { _id: "$_id.engine_id", engine: { $first: "$_id.engine" }, count: { $sum: "$count" }, type_stats: { $push: { type: "$_id.type", count: "$count" } } } },
          { $sort: { count: -1, engine: 1 } },
          { $limit: 100 },
        ],
        byType: [
          { $group: { _id: { type: "$type_label", engine_id: "$engine_id", engine: "$engine_name" }, count: { $sum: 1 } } },
          { $group: { _id: "$_id.type", count: { $sum: "$count" }, engines: { $push: { engine_id: "$_id.engine_id", engine: "$_id.engine", count: "$count" } } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 100 },
        ],
        daily: [
          { $set: { __maintenance_group_key: { $cond: [{ $and: [{ $ne: ["$group_id", null] }, { $ne: ["$group_id", ""] }] }, "$group_id", { $toString: "$_id" }] }, __maintenance_date: { $convert: { input: { $ifNull: ["$maintenance_start_at", "$created_at"] }, to: "date", onError: null, onNull: null } } } },
          { $match: { __maintenance_date: { $ne: null } } },
          { $set: { __maintenance_day: { $dateToString: { date: "$__maintenance_date", timezone: "Europe/Istanbul", format: "%Y-%m-%d" } } } },
          { $group: { _id: { date: "$__maintenance_day", engine_id: "$engine_id", engine: "$engine_name", group_key: "$__maintenance_group_key" }, types: { $addToSet: "$type_label" }, count: { $sum: 1 }, duration: { $max: { $ifNull: ["$maintenance_duration_minutes", 0] } }, source: { $first: "$technician_source" } } },
          { $sort: { "_id.date": 1, "_id.engine": 1, "_id.group_key": 1 } },
          { $limit: 500 },
        ],
      },
    },
  ]).toArray();
  const totals = row?.totals?.[0] || { total: 0, external: 0, duration: 0 };
  const total = Number(totals.total || 0);
  const external = Number(totals.external || 0);
  const uniqueEvents = Number(totals.unique_events || 0);
  const eventSummary = uniqueEvents !== total ? ` ${uniqueEvents} ortak bakım olayı.` : "";
  const daily = (row?.daily || []).map((item) => ({
    event_id: item._id?.group_key || null,
    date: item._id?.date || null,
    engine_id: item._id?.engine_id || null,
    engine: item._id?.engine || "Bilinmeyen",
    types: (item.types || []).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "tr")),
    count: Number(item.count || 0),
    duration_minutes: Number(item.duration || 0),
    source: item.source || "internal",
  }));
  return {
    intent: "summary",
    period: query.period,
    title: "Bakım özeti",
    summary: `${periodLabel(query)} ${total} bakım kaydı bulundu.${eventSummary} Bunun ${external} tanesi dış hizmet kaydıdır.`,
    data: {
      period: query.period,
      date_range: query.dateRange || null,
      filters: { engine: selectedEngine?.name || query.engineQuery || null, engine_id: selectedEngine ? String(selectedEngine._id) : null, maintenance_type: query.maintenanceTypeQuery || null, source: query.sourceFilter || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null, team_only: Boolean(query.teamOnly) },
      total_records: total,
      unique_events: uniqueEvents,
      external_service_records: external,
      recorded_duration_minutes: Number(totals.duration || 0),
      daily_records: daily,
      daily_record_count: daily.length,
      recorded_duration_text: formatMinutes(Number(totals.duration || 0)),
      by_engine: (row?.byEngine || []).map((item) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0), type_stats: (item.type_stats || []).filter((type) => Boolean(type.type)).sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.type).localeCompare(String(b.type), "tr")) })),
      by_type: (row?.byType || []).map((item) => ({ type: item._id || "Bilinmeyen", count: Number(item.count || 0), engines: (item.engines || []).filter((engine) => Boolean(engine.engine_id)).sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.engine).localeCompare(String(b.engine), "tr")) })),
    },
  };
}

async function getOverdueMaintenance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const { items } = await getOrBuildMaintenancePanelServerPayload(db);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const selectedType = await resolveMaintenanceType(db, query);
  const matchingOverdue = items
    .filter((item) => item.status === "gecikmis")
    .filter((item) => !query.engineQuery || (selectedEngine && item.engine_id === String(selectedEngine._id)))
    .filter((item) => !query.maintenanceTypeQuery || (selectedType && item.type_key === String(selectedType.key)))
    .filter((item) => !query.excludedTypeLabels?.some((excluded) => excluded.localeCompare(item.type_label, "tr", { sensitivity: "base" }) === 0))
    .sort((a, b) => a.remaining - b.remaining);
  const overdue = matchingOverdue.slice(0, 200);
  return {
    intent: "overdue",
    period: "all",
    title: "Gecikmiş bakımlar",
    summary: matchingOverdue.length ? `${matchingOverdue.length} gecikmiş bakım bulundu.` : "Şu anda gecikmiş bakım bulunamadı.",
    data: {
      count: matchingOverdue.length,
      displayed_count: overdue.length,
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
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1 } }).toArray(),
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
    excludedTypeLabels: query.excludedTypeLabels,
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
  const recordsCollectionRef = recordsCollection(db);
  const [totalRecords, records] = await Promise.all([
    recordsCollectionRef.countDocuments(match),
    recordsCollectionRef.find(
      match,
      {
      projection: {
        _id: 1, group_id: 1, engine_id: 1, engine_name: 1, type_key: 1, type_label: 1, hour_at_completion: 1, technician_name: 1, technician_source: 1,
        external_service_name: 1, other_technicians: 1, maintenance_start_at: 1, maintenance_end_at: 1,
        maintenance_duration_minutes: 1, report_attachments: 1, created_at: 1,
        },
      },
    ).sort({ maintenance_start_at: -1, created_at: -1 }).limit(query.showAll ? 500 : 20).toArray(),
  ]);
  const safeRecords = records.map((record) => {
    const reportAttachments = safeReportAttachments(record._id, record.report_attachments);
    return {
      id: String(record._id),
      group_id: record.group_id || null,
      engine_id: record.engine_id || null,
      engine_name: record.engine_name || null,
      type_key: record.type_key || null,
      type: record.type_label || "Bilinmeyen",
      hour_at_completion: Number(record.hour_at_completion || 0),
      technician: record.technician_name || "Bilinmeyen",
      technician_source: record.technician_source || "internal",
      external_service_name: record.external_service_name || null,
      other_technicians: Array.isArray(record.other_technicians) ? record.other_technicians.map((item) => item.full_name).filter(Boolean).slice(0, 10) : [],
      start_at: record.maintenance_start_at || null,
      end_at: record.maintenance_end_at || null,
      duration_minutes: Number(record.maintenance_duration_minutes || 0),
      duration_text: formatMinutes(Number(record.maintenance_duration_minutes || 0)),
      report_attachment_count: reportAttachments.length,
      report_attachments: reportAttachments,
      created_at: record.maintenance_start_at || record.created_at || null,
    };
  });
  return {
    intent: "engine_history",
    period: query.period,
    title: engine ? `${engine.name} bakım geçmişi` : "Motor bakım geçmişi",
    summary: engine ? `${engine.name} için ${periodLabel(query)} döneminde ${totalRecords} bakım kaydı bulundu.${safeRecords.reduce((sum, record) => sum + Number(record.report_attachment_count || 0), 0) ? " Rapor ekleri sonuç satırlarında gösteriliyor." : ""}` : `${periodLabel(query)} tüm motorlarda ${totalRecords} bakım kaydı bulundu.`,
    data: { engine_id: engine ? String(engine._id) : null, engine: engine?.name || null, current_hours: engine ? Number(engine.hours || 0) : null, total_records: totalRecords, displayed_records: safeRecords.length, has_more: totalRecords > safeRecords.length, show_all: query.showAll === true, report_attachment_count: safeRecords.reduce((sum, record) => sum + Number(record.report_attachment_count || 0), 0), date_range: query.dateRange || null, filters: { source: query.sourceFilter || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null }, records: safeRecords },
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
  const technicianDetails = await mapWithConcurrency(resultRows.slice(0, 12), 4, async (technician) => {
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
  });
  const totalTasks = resultRows.reduce((sum, item) => sum + item.responsible_count + item.support_count, 0);
  const totalResponsibleTasks = resultRows.reduce((sum, item) => sum + item.responsible_count, 0);
  const totalSupportTasks = resultRows.reduce((sum, item) => sum + item.support_count, 0);
  const totalDuration = resultRows.reduce((sum, item) => sum + item.duration_minutes, 0);
  const topTechnician = resultRows[0];
  const selectedRow = selected ? resultRows.find((item) => item.technician_id === selected.id || normalizeTechnicianName(item.technician) === normalizeTechnicianName(selected.full_name)) : undefined;
  const selectedTotalTasks = selectedRow ? selectedRow.responsible_count + selectedRow.support_count : 0;
  const selectedSummary = selected
    ? {
      id: selected.id,
      full_name: selected.full_name,
      technician_type: selected.technician_type,
      responsible_tasks: selectedRow?.responsible_count || 0,
      support_tasks: selectedRow?.support_count || 0,
      total_tasks: selectedTotalTasks,
      duration_minutes: selectedRow?.duration_minutes || 0,
      duration_text: formatMinutes(selectedRow?.duration_minutes || 0),
    }
    : null;
  return {
    intent: "technician_performance",
    period: query.period,
    title: selected ? `${selected.full_name} teknisyen özeti` : "Teknisyen performans özeti",
    summary: selected
      ? `${selected.full_name}, ${periodLabel(query)} döneminde kayıtlara göre toplam ${formatMinutes(selectedRow?.duration_minutes || 0)} çalıştı. ${selectedTotalTasks} görevde yer aldı; ${selectedRow?.responsible_count || 0} sorumlu, ${selectedRow?.support_count || 0} yardımcı görev.`
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

function historyDayKey(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatPerformanceNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "veri yok" : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

async function getEngineData(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const performanceMode = query.enginePerformance === true;
  const filter = selectedEngine ? { _id: String(selectedEngine._id) } : query.engineQuery ? { _id: "__assistant_no_matching_engine__" } : {};
  const engines = await enginesCollection(db).find(filter, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).sort({ name: 1 }).limit(100).toArray();
  const dailyByEngine = new Map<string, { engine_id: string; engine: string; date: string; timestamp: number; hours: number; load_kw: number | null; measurements: number }>();
  const rows = engines.map((engine) => {
    const allHistory = Array.isArray(engine.history) ? engine.history : [];
    const filteredHistory = query.dateRange || query.period !== "all"
      ? allHistory.filter((entry) => isDateInAssistantQuery(entry.date, query)).slice(-366)
      : allHistory.slice(-30);
    const performanceHistory = performanceMode ? filteredHistory : [];
    performanceHistory.forEach((entry) => {
      const date = historyDayKey(entry.date);
      const timestamp = new Date(String(entry.date)).getTime();
      if (!date || !Number.isFinite(timestamp)) return;
      const engineId = String(engine._id);
      const key = `${engineId}|${date}`;
      const load = typeof entry.load_kw === "number" && Number.isFinite(entry.load_kw) ? entry.load_kw : null;
      const previous = dailyByEngine.get(key);
      if (!previous) {
        dailyByEngine.set(key, { engine_id: engineId, engine: String(engine.name || engineId), date, timestamp, hours: Number(entry.hours || 0), load_kw: load, measurements: 1 });
      } else {
        previous.measurements += 1;
        if (timestamp >= previous.timestamp) {
          previous.timestamp = timestamp;
          previous.hours = Number(entry.hours || 0);
          previous.load_kw = load;
        }
      }
    });
    const history = filteredHistory.map((entry) => ({ date: formatUnknownDate(entry.date), hours: Number(entry.hours || 0), load_kw: typeof entry.load_kw === "number" && Number.isFinite(entry.load_kw) ? entry.load_kw : null }));
    return { engine_id: String(engine._id), engine: engine.name, hours: Number(engine.hours || 0), load_kw: Number(engine.load_kw || 0), updated_at: formatUnknownDate(engine.updated_at), latest_history: history.at(-1) || null, history };
  });
  const performanceDaily = performanceMode ? [...dailyByEngine.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.engine.localeCompare(b.engine, "tr"))
    .map(({ timestamp: _timestamp, ...entry }) => entry) : [];
  const hoursValues = performanceDaily.map((entry) => entry.hours).filter((value) => Number.isFinite(value));
  const loadValues = performanceDaily.map((entry) => entry.load_kw).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageHours = hoursValues.length ? hoursValues.reduce((sum, value) => sum + value, 0) / hoursValues.length : null;
  const averageLoad = loadValues.length ? loadValues.reduce((sum, value) => sum + value, 0) / loadValues.length : null;
  const performancePeriod = periodLabel(query);
  const performanceSummary = performanceDaily.length > 0
    ? `${performancePeriod} ${performanceDaily.length} motor-günlük ölçüm bulundu. Dönem ortalaması: ${formatPerformanceNumber(averageHours)} motor saati ve ${formatPerformanceNumber(averageLoad)} kW yük.`
    : `${performancePeriod} için motor çalışma saati ve yük geçmişi bulunamadı.`;
  const summary = performanceMode ? performanceSummary : selectedEngine
    ? `${selectedEngine.name} için çalışma saati, yük ve son saat geçmişi hazırlandı.`
    : `${rows.length} motorun çalışma saati, yük ve son saat geçmişi hazırlandı.`;
  return {
    intent: "engine_data",
    period: query.period,
    title: performanceMode ? (selectedEngine ? `${selectedEngine.name} motor performansı` : "Motor performansı") : (selectedEngine ? `${selectedEngine.name} motor bilgileri` : "Motor çalışma ve yük bilgileri"),
    summary,
    data: {
      date_range: query.dateRange || null,
      ...(performanceMode ? {
        performance_mode: true,
        performance_daily: performanceDaily,
        performance_days: new Set(performanceDaily.map((entry) => entry.date)).size,
        performance_observations: performanceDaily.length,
        average_hours: averageHours,
        average_load_kw: averageLoad,
      } : { performance_mode: false }),
      engines: rows,
    },
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

function normalizeEquipmentEngineName(value: unknown): string {
  const compact = String(value || "").normalize("NFC").toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "");
  const agm = compact.match(/^agm0*(\d{1,3})$/u);
  return agm ? `agm${Number(agm[1])}` : compact;
}

async function getEquipmentInfo(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const allInfos = await equipmentInfoCollection(db).find({}, { projection: { _id: 1, engine_name: 1, kaver_tipi: 1, hava_filtresi: 1, krankcase: 1, esanjor_tipi: 1, dungs: 1, radyator_tipi: 1, not: 1 } }).sort({ engine_name: 1 }).limit(200).toArray();
  const selectedEngineName = selectedEngine ? normalizeEquipmentEngineName(selectedEngine.name) : "";
  const infos = selectedEngine
    ? allInfos.filter((info) => normalizeEquipmentEngineName(info.engine_name) === selectedEngineName || normalizeEquipmentEngineName(info._id) === selectedEngineName)
    : query.engineQuery ? [] : allInfos;
  return {
    intent: "equipment_info",
    period: "all",
    title: selectedEngine ? `${selectedEngine.name} teknik bilgi kartı` : "Motor teknik bilgi kartları",
    summary: `${infos.length} motor teknik bilgi kartı bulundu.`,
    data: { infos: infos.map((info) => ({ id: String(info._id), engine_name: info.engine_name || String(info._id), kaver_tipi: info.kaver_tipi || null, hava_filtresi: info.hava_filtresi || null, krankcase: info.krankcase || null, esanjor_tipi: info.esanjor_tipi || null, dungs: info.dungs || null, radyator_tipi: info.radyator_tipi || null, note: info.not || null })) },
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
  const { items: snapshotItems } = await getOrBuildMaintenancePanelServerPayload(db);
  const workMatch = await buildRecordMatch(db, query);
  const workRecords = await recordsCollection(db).find(workMatch, {
    projection: { _id: 1, group_id: 1, engine_id: 1, type_key: 1, type_label: 1, maintenance_duration_minutes: 1, maintenance_start_at: 1, created_at: 1 },
  }).sort({ maintenance_start_at: -1, created_at: -1 }).limit(5000).toArray();
  const workIndex = buildMaintenanceWorkIndex(workRecords as Array<Record<string, unknown>>);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const selectedType = await resolveMaintenanceType(db, query);
  const statusMap: Record<string, PanelItem["status"]> = { overdue: "gecikmis", critical: "kritik", upcoming: "yaklasiyor", normal: "normal" };
  const requestedStatus = query.statusFilter ? statusMap[query.statusFilter] : undefined;
  const items = snapshotItems
    .filter((item) => !query.engineQuery || (selectedEngine && item.engine_id === String(selectedEngine._id)))
    .filter((item) => !query.maintenanceTypeQuery || (selectedType && item.type_key === String(selectedType.key)))
    .filter((item) => !query.excludedTypeLabels?.some((excluded) => excluded.localeCompare(item.type_label, "tr", { sensitivity: "base" }) === 0))
    .filter((item) => !requestedStatus || item.status === requestedStatus)
    .sort((a, b) => a.remaining - b.remaining || a.engine_name.localeCompare(b.engine_name, "tr"));
  const counts = items.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});
  const displayedItems = items.slice(0, query.showAll ? 500 : 200).map((item) => {
    const work = workIndex.get(`${item.engine_id}|${item.type_key}`) || workIndex.get(`${item.engine_id}|${item.type_label}`) || { total_duration_minutes: 0, last_duration_minutes: 0, completed_count: 0, last_completed_at: null };
    const workedSinceLastHours = Math.max(0, Number(item.engine_hours || 0) - Number(item.last_hour || 0));
    return { engine_id: item.engine_id, engine: item.engine_name, type_key: item.type_key, type: item.type_label, engine_hours: item.engine_hours, last_hour: item.last_hour, period_hours: item.period, remaining_hours: item.remaining, worked_since_last_hours: workedSinceLastHours, worked_duration_minutes: work.total_duration_minutes, last_worked_duration_minutes: work.last_duration_minutes, completed_count: work.completed_count, last_completed_at: work.last_completed_at, status: item.status };
  });
  return {
    intent: "maintenance_health",
    period: "all",
    title: selectedEngine ? `${selectedEngine.name} bakım sağlığı` : "Motor bakım sağlığı",
    summary: `${items.length} motor-bakım durumu bulundu: ${counts.gecikmis || 0} gecikmiş, ${counts.kritik || 0} kritik, ${counts.yaklasiyor || 0} yaklaşan, ${counts.normal || 0} normal. Çalışma süresi bulunan ${displayedItems.filter((item) => item.worked_duration_minutes > 0).length} bakım satırı gösteriliyor.`,
    data: { counts, total_items: items.length, displayed_items: displayedItems.length, has_more: items.length > displayedItems.length, show_all: query.showAll === true, items: displayedItems },
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
