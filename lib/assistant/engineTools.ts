import type { Db } from "mongodb";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import { enginesCollection, equipmentInfoCollection, maintenanceTypesCollection } from "@/lib/dbCollections";
import { formatPerformanceNumber, formatUnknownDate } from "@/lib/assistantToolOutput";
import { findEngine, historyDayKey, isDateInAssistantQuery, periodLabel, resolveMaintenanceType } from "@/lib/assistantToolQuery";
import type { AssistantToolResponse } from "./types";
export async function getEngineData(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

export async function getMaintenanceCatalog(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

export function normalizeEquipmentEngineName(value: unknown): string {
  const compact = String(value || "").normalize("NFC").toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "");
  const agm = compact.match(/^agm0*(\d{1,3})$/u);
  return agm ? `agm${Number(agm[1])}` : compact;
}

export async function getEquipmentInfo(db: Db, query: AssistantQuery): Promise<AssistantToolResponse> {
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

