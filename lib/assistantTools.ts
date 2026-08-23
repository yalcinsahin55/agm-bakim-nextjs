import type { Db } from "mongodb";
import { buildItems, type PanelItem } from "@/lib/status";
import type { Engine, MaintenanceType } from "@/lib/types";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName } from "@/lib/technicians";
import type { AssistantPeriod, AssistantQuery, AssistantIntent, AssistantStatusFilter } from "@/lib/assistantPolicy";

export interface AssistantToolResponse {
  intent: AssistantIntent;
  period: AssistantPeriod;
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

function periodStart(period: AssistantPeriod): Date | null {
  const now = new Date();
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === "3months") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  if (period === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

function dateKeyLabel(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : value;
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
  return db.collection("maintenance_types").findOne(
    { $or: [{ key: value }, { label: { $regex: escaped, $options: "i" } }] },
    { projection: { key: 1, label: 1 } },
  );
}

async function statusPairs(db: Db, status: AssistantStatusFilter | undefined): Promise<Array<{ engine_id: string; type_key: string }>> {
  if (!status) return [];
  const [engines, types] = await Promise.all([
    db.collection("engines").find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    db.collection("maintenance_types").find({}, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_states: 1 } }).toArray(),
  ]);
  const targetStatus = status === "overdue" ? "gecikmis" : status === "critical" ? "kritik" : status === "upcoming" ? "yaklasiyor" : "normal";
  return buildItems(engines as unknown as Engine[], types as unknown as MaintenanceType[])
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
  if (query.recordFilters?.includes("unconfirmed")) clauses.push({ $or: [{ completion_confirmed_at: { $exists: false } }, { completion_confirmed_at: null }] });
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
  const records = db.collection("maintenance_records");
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match = await buildRecordMatch(db, query);
  const [row] = await records.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              external: { $sum: { $cond: [externalExpression(), 1, 0] } },
              duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } },
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
      by_engine: (row?.byEngine || []).map((item: any) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0), type_stats: Array.isArray(item.type_stats) ? item.type_stats.filter((type: any) => type && type.type).sort((a: any, b: any) => Number(b.count || 0) - Number(a.count || 0) || String(a.type).localeCompare(String(b.type), "tr")) : [] })),
      by_type: (row?.byType || []).map((item: any) => ({ type: item._id || "Bilinmeyen", count: Number(item.count || 0), engines: Array.isArray(item.engines) ? item.engines.filter((engine: any) => engine && engine.engine_id).sort((a: any, b: any) => Number(b.count || 0) - Number(a.count || 0) || String(a.engine).localeCompare(String(b.engine), "tr")) : [] })),
    },
  };
}

async function getOverdueMaintenance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const [engines, types] = await Promise.all([
    db.collection("engines").find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    db.collection("maintenance_types").find({}, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_states: 1 } }).toArray(),
  ]);
  const items = buildItems(engines as unknown as Engine[], types as unknown as MaintenanceType[]);
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
        remaining_hours: Math.round(item.remaining),
        overdue_hours: Math.max(0, Math.round(Math.abs(item.remaining))),
      })),
    },
  };
}

async function findEngine(db: Db, engineQuery: string) {
  const value = engineQuery.trim();
  const escaped = escapeRegex(value);
  const engines = db.collection("engines") as any;
  const projection = { projection: { _id: 1, name: 1, hours: 1 } };
  const exact = await engines.findOne(
    { $or: [{ _id: value }, { name: { $regex: `^${escaped}$`, $options: "i" } }] },
    projection,
  );
  if (exact) return exact;
  return engines.findOne({ name: { $regex: escaped, $options: "i" } }, projection);
}

async function getEngineMaintenanceHistory(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  if (!query.engineQuery) {
    return {
      intent: "engine_history",
      period: query.period,
      title: "Motor bakım geçmişi",
      summary: "Hangi motoru incelememi istediğini belirtirsen bakım geçmişini gösterebilirim.",
      data: { records: [] },
    };
  }
  const engine = await findEngine(db, query.engineQuery);
  if (!engine) {
    return { intent: "engine_history", period: query.period, title: "Motor bakım geçmişi", summary: `“${query.engineQuery}” ile eşleşen motor bulunamadı.`, data: { records: [] } };
  }
  const match = await buildRecordMatch(db, query, { engine_id: String(engine._id) });
  const records = await db.collection("maintenance_records").find(
    match,
    {
      projection: {
        _id: 1, type_label: 1, hour_at_completion: 1, technician_name: 1, technician_source: 1,
        external_service_name: 1, other_technicians: 1, maintenance_start_at: 1, maintenance_end_at: 1,
        maintenance_duration_minutes: 1, created_at: 1,
      },
    },
  ).sort({ created_at: -1 }).limit(20).toArray();
  const safeRecords = records.map((record: any) => ({
    id: String(record._id),
    type: record.type_label || "Bilinmeyen",
    hour_at_completion: Number(record.hour_at_completion || 0),
    technician: record.technician_name || "Bilinmeyen",
    technician_source: record.technician_source || "internal",
    external_service_name: record.external_service_name || null,
    other_technicians: Array.isArray(record.other_technicians) ? record.other_technicians.map((item: any) => item.full_name).filter(Boolean).slice(0, 10) : [],
    start_at: record.maintenance_start_at || null,
    end_at: record.maintenance_end_at || null,
    duration_minutes: Number(record.maintenance_duration_minutes || 0),
    created_at: record.created_at || null,
  }));
  return {
    intent: "engine_history",
    period: query.period,
    title: `${engine.name} bakım geçmişi`,
    summary: `${engine.name} için ${periodLabel(query)} döneminde ${safeRecords.length} bakım kaydı bulundu.`,
    data: { engine_id: String(engine._id), engine: engine.name, current_hours: Number(engine.hours || 0), date_range: query.dateRange || null, filters: { source: query.sourceFilter || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null }, records: safeRecords },
  };
}

async function getTechnicianPerformance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const technicians = await listActiveTechnicians(db);
  const normalizedQuestion = normalizeTechnicianName(query.question);
  const selected = technicians.find((technician) => normalizedQuestion.includes(normalizeTechnicianName(technician.full_name)));
  const records = db.collection("maintenance_records");
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match = await internalRecordMatch(db, query, query.engineQuery ? { engine_id: selectedEngine ? String(selectedEngine._id) : "__assistant_no_matching_engine__" } : {});
  const includeResponsible = query.technicianRole !== "support";
  const includeSupport = query.technicianRole !== "responsible";
  const [responsible, support] = await Promise.all([
    includeResponsible ? records.aggregate([
      { $match: match },
      { $group: { _id: "$technician_id", technician: { $first: "$technician_name" }, count: { $sum: 1 }, duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray() : Promise.resolve([]),
    includeSupport ? records.aggregate([
      { $match: match },
      { $unwind: "$other_technicians" },
      { $group: { _id: "$other_technicians.id", technician: { $first: "$other_technicians.full_name" }, count: { $sum: 1 }, duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray() : Promise.resolve([]),
  ]);
  const rows = new Map<string, { technician_id: string; technician: string; responsible_count: number; support_count: number; duration_minutes: number; average_minutes: number }>();
  const merge = (item: any, kind: "responsible" | "support") => {
    const id = String(item._id || "unknown");
    const current = rows.get(id) || { technician_id: id, technician: item.technician || "Bilinmeyen", responsible_count: 0, support_count: 0, duration_minutes: 0, average_minutes: 0 };
    current.technician = item.technician || current.technician;
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
      projection: { _id: 1, engine_id: 1, engine_name: 1, type_label: 1, technician_id: 1, technician_name: 1, other_technicians: 1, maintenance_start_at: 1, maintenance_duration_minutes: 1, created_at: 1 },
    }).sort({ created_at: -1 }).limit(50).toArray();
    const typeCounts = new Map<string, number>();
    const typeEngineCounts = new Map<string, Map<string, { engine_id: string; engine: string; count: number }>>();
    const engineCounts = new Map<string, { engine_id: string; engine: string; count: number }>();
    const engineTypeCounts = new Map<string, Map<string, number>>();
    activities = selectedRecords.map((record: any) => {
      const isResponsible = String(record.technician_id) === selected.id || normalizeTechnicianName(record.technician_name) === normalizeTechnicianName(selected.full_name);
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
      return {
        id: String(record._id),
        engine_id: record.engine_id || null,
        engine,
        type,
        role: isResponsible ? "Sorumlu" : "Yardımcı",
        start_at: record.maintenance_start_at || null,
        duration_minutes: Number(record.maintenance_duration_minutes || 0),
        created_at: record.created_at || null,
      };
    });
    activityByType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).map(([type, count]) => ({ type, count, engines: [...(typeEngineCounts.get(type)?.values() || [])].sort((a, b) => b.count - a.count || a.engine.localeCompare(b.engine, "tr")) }));
    activityByEngine = [...engineCounts.values()].sort((a, b) => b.count - a.count || a.engine.localeCompare(b.engine, "tr")).map((engine) => ({ ...engine, type_stats: [...(engineTypeCounts.get(engine.engine_id)?.entries() || [])].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "tr")) }));
  }
  const technicianDetails = await Promise.all(resultRows.slice(0, 12).map(async (technician) => {
    if (!technician.technician_id || technician.technician_id === "unknown") return { technician_id: technician.technician_id, by_type: [], by_engine: [] };
    const detailMatch = { $and: [match, { $or: [{ technician_id: technician.technician_id }, { "other_technicians.id": technician.technician_id }] }] };
    const [detail] = await records.aggregate([
      { $match: detailMatch },
      { $facet: {
        byType: [{ $group: { _id: "$type_label", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }],
        byEngine: [{ $group: { _id: { engine_id: "$engine_id", engine: "$engine_name" }, count: { $sum: 1 } } }, { $sort: { count: -1, "_id.engine": 1 } }, { $limit: 20 }],
      } },
    ]).toArray();
    return {
      technician_id: technician.technician_id,
      by_type: (detail?.byType || []).map((item: any) => ({ type: item._id || "Bilinmeyen", count: Number(item.count || 0) })),
      by_engine: (detail?.byEngine || []).map((item: any) => ({ engine_id: item._id?.engine_id || null, engine: item._id?.engine || "Bilinmeyen", count: Number(item.count || 0) })),
    };
  }));
  const totalTasks = resultRows.reduce((sum, item) => sum + item.responsible_count + item.support_count, 0);
  const totalDuration = resultRows.reduce((sum, item) => sum + item.duration_minutes, 0);
  const topTechnician = resultRows[0];
  return {
    intent: "technician_performance",
    period: query.period,
    title: selected ? `${selected.full_name} teknisyen özeti` : "Teknisyen performans özeti",
    summary: selected
      ? `${selected.full_name} için ${periodLabel(query)} döneminde ${totalTasks} görev ve ${formatMinutes(totalDuration)} katkı süresi bulundu. ${activityByType.length} farklı bakım türünde çalıştı.`
      : `${periodLabel(query)} ${totalTasks} teknisyen görevi ve ${formatMinutes(totalDuration)} toplam katkı süresi bulundu.${topTechnician ? ` En çok görev alan teknisyen: ${topTechnician.technician} (${topTechnician.responsible_count + topTechnician.support_count} görev).` : ""}`,
    data: { period: query.period, date_range: query.dateRange || null, filters: { engine: selectedEngine ? selectedEngine.name : query.engineQuery || null, maintenance_type: query.maintenanceTypeQuery || null, role: query.technicianRole || "any", source: "internal", evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null, team_only: Boolean(query.teamOnly) }, selected_technician: selected ? { id: selected.id, full_name: selected.full_name } : null, top_technician: topTechnician ? { id: topTechnician.technician_id, full_name: topTechnician.technician, total_tasks: topTechnician.responsible_count + topTechnician.support_count } : null, technicians: resultRows.slice(0, 12), technician_details: technicianDetails, activities, by_type: activityByType, by_engine: activityByEngine },
  };
}

async function getExternalServiceSummary(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const serviceFilter = query.serviceQuery ? { $or: [{ external_service_name: { $regex: escapeRegex(query.serviceQuery), $options: "i" } }, { technician_name: { $regex: escapeRegex(query.serviceQuery), $options: "i" } }] } : {};
  const match = await buildRecordMatch(db, query, { $and: [{ $or: [{ technician_source: "external_service" }, { technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID }] }, serviceFilter] });
  const [row] = await db.collection("maintenance_records").aggregate([
    { $match: match },
    {
      $facet: {
        totals: [{ $group: { _id: null, count: { $sum: 1 }, duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } }],
        services: [
          { $group: { _id: { $ifNull: ["$external_service_name", "$technician_name"] }, count: { $sum: 1 }, duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
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
      services: (row?.services || []).map((item: any) => ({ service: item._id || "Harici servis", count: Number(item.count || 0), duration_minutes: Number(item.duration || 0) })),
      filters: { service: query.serviceQuery || null, engine: query.engineQuery || null, maintenance_type: query.maintenanceTypeQuery || null, evidence: query.evidenceFilter || null, status: query.statusFilter || null, record_filters: query.recordFilters || [], hour_range: query.hourRange || null, duration_range: query.durationRange || null, team_only: Boolean(query.teamOnly) },
      engines: (row?.engines || []).map((item: any) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0) })),
    },
  };
}

export async function runAssistantTool(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  if (query.intent === "summary") return getMaintenanceSummary(db, query);
  if (query.intent === "overdue") return getOverdueMaintenance(db, query);
  if (query.intent === "engine_history") return getEngineMaintenanceHistory(db, query);
  if (query.intent === "technician_performance") return getTechnicianPerformance(db, query);
  if (query.intent === "external_service") return getExternalServiceSummary(db, query);
  return {
    intent: "help",
    period: query.period,
    title: "Bakım Asistanı",
    summary: "Bakım kayıtları ve raporlar hakkında salt okunur bilgi verebilirim.",
    data: {
      examples: [
        "Bu ay kaç bakım yapıldı?",
        "Hangi bakımlar gecikmiş?",
        "Bir motorun bakım geçmişi nasıl görüntülenir?",
        "Yalçın Şahin'in son üç aylık performansı nasıl?",
        "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
      ],
    },
  };
}
