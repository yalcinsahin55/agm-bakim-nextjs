import type { Db } from "mongodb";
import { type PanelItem } from "@/lib/status";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import { enginesCollection, maintenanceTypesCollection, recordsCollection } from "@/lib/dbCollections";
import { buildMaintenanceForecastRows, summarizeMaintenanceForecast, validForecastYear, validMaintenancePeriodHours } from "@/lib/maintenanceForecast";
import { formatMinutes, safeReportAttachments } from "@/lib/assistantToolOutput";
import { buildRecordMatch, externalExpression, findEngine, periodLabel, resolveMaintenanceType } from "@/lib/assistantToolQuery";
import { getOrBuildMaintenancePanelServerPayload } from "@/lib/maintenancePanelServer";
import type { AssistantToolResponse } from "./types";
import { buildMaintenanceWorkIndex } from "./shared";
import { withDbTiming } from "@/lib/performance";
export type SummaryTotalsRow = { total?: number; unique_events?: number; external?: number; duration?: number };
export type SummaryEngineRow = { _id?: string; engine?: string; count?: number; type_stats?: Array<{ type?: string; count?: number }> };
export type SummaryTypeRow = { _id?: string; count?: number; engines?: Array<{ engine_id?: string; engine?: string; count?: number }> };
export type SummaryDailyRow = { _id?: { date?: Date | string; engine_id?: string; engine?: string; group_key?: string }; types?: string[]; count?: number; duration?: number; source?: string };
export type SummaryAggregateRow = { totals?: SummaryTotalsRow[]; byEngine?: SummaryEngineRow[]; byType?: SummaryTypeRow[]; daily?: SummaryDailyRow[] };
export async function getMaintenanceSummary(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const records = recordsCollection(db);
  const selectedEngine = query.engineQuery ? await findEngine(db, query.engineQuery) : null;
  const match = await buildRecordMatch(db, query);
  const [row] = await withDbTiming("assistant.maintenance_summary.aggregate", () => records.aggregate<SummaryAggregateRow>([
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
  ]).toArray());
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

export async function getOverdueMaintenance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

export async function getMaintenanceForecast(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

export async function getEngineMaintenanceHistory(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

export async function getMaintenanceHealth(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
  const { items: snapshotItems } = await getOrBuildMaintenancePanelServerPayload(db);
  const workMatch = await buildRecordMatch(db, query);
  const workRecords = await withDbTiming("assistant.maintenance_health.work_records", () => recordsCollection(db).find(workMatch, {
    projection: { _id: 1, group_id: 1, engine_id: 1, type_key: 1, type_label: 1, maintenance_duration_minutes: 1, maintenance_start_at: 1, created_at: 1 },
  }).sort({ maintenance_start_at: -1, created_at: -1 }).limit(5000).toArray());
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

