import type { Db } from "mongodb";
import { buildItems, type PanelItem } from "@/lib/status";
import type { Engine, MaintenanceType } from "@/lib/types";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName } from "@/lib/technicians";
import type { AssistantPeriod, AssistantQuery, AssistantIntent } from "@/lib/assistantPolicy";

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

function periodLabel(period: AssistantPeriod): string {
  return period === "month" ? "bu ay" : period === "3months" ? "son üç ay" : period === "year" ? "bu yıl" : "tüm dönem";
}

function periodMatch(period: AssistantPeriod): Record<string, unknown> {
  const start = periodStart(period);
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

function internalRecordMatch(period: AssistantPeriod): Record<string, unknown> {
  return {
    ...periodMatch(period),
    technician_source: { $ne: "external_service" },
    technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID },
  };
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
  const [row] = await records.aggregate([
    { $match: periodMatch(query.period) },
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
          { $group: { _id: "$engine_id", engine: { $first: "$engine_name" }, count: { $sum: 1 } } },
          { $sort: { count: -1, engine: 1 } },
          { $limit: 8 },
        ],
        byType: [
          { $group: { _id: "$type_label", count: { $sum: 1 } } },
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
    summary: `${periodLabel(query.period)} ${total} bakım kaydı bulundu. Bunun ${external} tanesi dış hizmet kaydıdır.`,
    data: {
      period: query.period,
      total_records: total,
      external_service_records: external,
      recorded_duration_minutes: Number(totals.duration || 0),
      recorded_duration_text: formatMinutes(Number(totals.duration || 0)),
      by_engine: (row?.byEngine || []).map((item: any) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0) })),
      by_type: (row?.byType || []).map((item: any) => ({ type: item._id || "Bilinmeyen", count: Number(item.count || 0) })),
    },
  };
}

async function getOverdueMaintenance(db: Db): Promise<AssistantToolResponse> {
  const [engines, types] = await Promise.all([
    db.collection("engines").find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    db.collection("maintenance_types").find({}, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_states: 1 } }).toArray(),
  ]);
  const items = buildItems(engines as unknown as Engine[], types as unknown as MaintenanceType[]);
  const overdue = items
    .filter((item) => item.status === "gecikmis")
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 20);
  return {
    intent: "overdue",
    period: "all",
    title: "Gecikmiş bakımlar",
    summary: overdue.length ? `${overdue.length} gecikmiş bakım bulundu.` : "Şu anda gecikmiş bakım bulunamadı.",
    data: {
      count: overdue.length,
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
  return engines.findOne(
    { $or: [{ _id: value }, { name: { $regex: escaped, $options: "i" } }] },
    { projection: { _id: 1, name: 1, hours: 1 } },
  );
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
  const records = await db.collection("maintenance_records").find(
    { engine_id: String(engine._id), ...periodMatch(query.period) },
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
    summary: `${engine.name} için ${safeRecords.length} bakım kaydı bulundu.`,
    data: { engine_id: String(engine._id), engine: engine.name, current_hours: Number(engine.hours || 0), records: safeRecords },
  };
}

async function getTechnicianPerformance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const technicians = await listActiveTechnicians(db);
  const normalizedQuestion = normalizeTechnicianName(query.question);
  const selected = technicians.find((technician) => normalizedQuestion.includes(normalizeTechnicianName(technician.full_name)));
  const records = db.collection("maintenance_records");
  const match = internalRecordMatch(query.period);
  const [responsible, support] = await Promise.all([
    records.aggregate([
      { $match: match },
      { $group: { _id: "$technician_id", technician: { $first: "$technician_name" }, count: { $sum: 1 }, duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray(),
    records.aggregate([
      { $match: match },
      { $unwind: "$other_technicians" },
      { $group: { _id: "$other_technicians.id", technician: { $first: "$other_technicians.full_name" }, count: { $sum: 1 }, duration: { $sum: { $ifNull: ["$maintenance_duration_minutes", 0] } } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray(),
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
  const totalTasks = resultRows.reduce((sum, item) => sum + item.responsible_count + item.support_count, 0);
  const totalDuration = resultRows.reduce((sum, item) => sum + item.duration_minutes, 0);
  return {
    intent: "technician_performance",
    period: query.period,
    title: selected ? `${selected.full_name} teknisyen özeti` : "Teknisyen performans özeti",
    summary: selected
      ? `${selected.full_name} için ${totalTasks} görev ve ${formatMinutes(totalDuration)} katkı süresi bulundu.`
      : `${periodLabel(query.period)} ${totalTasks} teknisyen görevi ve ${formatMinutes(totalDuration)} toplam katkı süresi bulundu.`,
    data: { period: query.period, selected_technician: selected ? { id: selected.id, full_name: selected.full_name } : null, technicians: resultRows.slice(0, 12) },
  };
}

async function getExternalServiceSummary(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const [row] = await db.collection("maintenance_records").aggregate([
    { $match: { ...periodMatch(query.period), $or: [{ technician_source: "external_service" }, { technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID }] } },
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
    summary: `${periodLabel(query.period)} ${Number(totals.count || 0)} dış hizmet bakım kaydı bulundu.`,
    data: {
      count: Number(totals.count || 0),
      duration_minutes: Number(totals.duration || 0),
      duration_text: formatMinutes(Number(totals.duration || 0)),
      services: (row?.services || []).map((item: any) => ({ service: item._id || "Harici servis", count: Number(item.count || 0), duration_minutes: Number(item.duration || 0) })),
      engines: (row?.engines || []).map((item: any) => ({ engine_id: item._id, engine: item.engine || "Bilinmeyen", count: Number(item.count || 0) })),
    },
  };
}

export async function runAssistantTool(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  if (query.intent === "summary") return getMaintenanceSummary(db, query);
  if (query.intent === "overdue") return getOverdueMaintenance(db);
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
        "Motor 03'ün bakım geçmişi nedir?",
        "Yalçın Şahin'in son üç aylık performansı nasıl?",
        "Garanti kapsamında dış servise giden motorlar hangileri?",
      ],
    },
  };
}
