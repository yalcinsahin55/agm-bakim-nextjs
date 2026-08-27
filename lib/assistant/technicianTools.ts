import type { Db } from "mongodb";
import { EXTERNAL_SERVICE_TECHNICIAN_ID, listActiveTechnicians, normalizeTechnicianName, normalizeTechnicianType, TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import { recordsCollection } from "@/lib/dbCollections";
import { formatMinutes } from "@/lib/assistantToolOutput";
import { buildRecordMatch, escapeRegex, findEngine, internalRecordMatch, periodLabel } from "@/lib/assistantToolQuery";
import type { AssistantToolResponse } from "./types";
import { mapWithConcurrency } from "./shared";
import { withDbTiming } from "@/lib/performance";
type TechnicianAggregateRow = { _id?: unknown; technician?: string; technician_type?: unknown; count?: number; duration?: number };
type TechnicianDetailTypeRow = { _id?: string; count?: number };
type TechnicianDetailEngineRow = { _id?: { engine_id?: string; engine?: string }; count?: number };
type ExternalServiceAggregateRow = { totals?: Array<{ count?: number; duration?: number }>; services?: Array<{ _id?: string; count?: number; duration?: number }>; engines?: Array<{ _id?: string; engine?: string; count?: number }> };

export async function getTechnicianPerformance(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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
    includeResponsible ? withDbTiming("assistant.technician.responsible", () => records.aggregate<TechnicianAggregateRow>([
      { $match: match },
      { $project: contributionProject },
      { $unwind: "$contributions" },
      contributionMatch("responsible"),
      { $group: { _id: { group_key: "$group_key", technician_id: "$contributions.id" }, technician: { $first: "$contributions.full_name" }, technician_type: { $first: "$contributions.technician_type" }, duration: { $max: { $ifNull: ["$contributions.duration_minutes", 0] } } } },
      { $group: { _id: "$_id.technician_id", technician: { $first: "$technician" }, technician_type: { $first: "$technician_type" }, count: { $sum: 1 }, duration: { $sum: "$duration" } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray()) : Promise.resolve([]),
    includeSupport ? withDbTiming("assistant.technician.support", () => records.aggregate<TechnicianAggregateRow>([
      { $match: match },
      { $project: contributionProject },
      { $unwind: "$contributions" },
      contributionMatch("support"),
      { $group: { _id: { group_key: "$group_key", technician_id: "$contributions.id" }, technician: { $first: "$contributions.full_name" }, technician_type: { $first: "$contributions.technician_type" }, duration: { $max: { $ifNull: ["$contributions.duration_minutes", 0] } } } },
      { $group: { _id: "$_id.technician_id", technician: { $first: "$technician" }, technician_type: { $first: "$technician_type" }, count: { $sum: 1 }, duration: { $sum: "$duration" } } },
      { $sort: { count: -1, technician: 1 } },
      { $limit: 100 },
    ]).toArray()) : Promise.resolve([]),
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
    const selectedRecords = await withDbTiming("assistant.technician.activities", () => records.find(selectedMatch, {
      projection: { _id: 1, group_id: 1, engine_id: 1, engine_name: 1, type_label: 1, technician_id: 1, technician_name: 1, technician_type: 1, other_technicians: 1, technician_contributions: 1, maintenance_start_at: 1, maintenance_duration_minutes: 1, created_at: 1 },
    }).sort({ maintenance_start_at: -1, created_at: -1 }).limit(50).toArray());
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
    const [detail] = await withDbTiming("assistant.technician.detail", () => records.aggregate<{ byType?: TechnicianDetailTypeRow[]; byEngine?: TechnicianDetailEngineRow[] }>([
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
    ]).toArray());
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

export async function getExternalServiceSummary(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

export async function getTechnicianDirectory(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

