import type { Db } from "mongodb";
import { enginesCollection, maintenanceTypesCollection } from "@/lib/dbCollections";
import type { AssistantStatusFilter } from "@/lib/assistantPolicy";
import {
  buildMaintenanceForecastRows,
  summarizeMaintenanceForecast,
  validForecastYear,
  validMaintenancePeriodHours,
  type MaintenanceForecastRow,
  type MaintenanceForecastSummary,
} from "@/lib/maintenanceForecast";

export interface ForecastExportContext {
  rows: MaintenanceForecastRow[];
  summary: MaintenanceForecastSummary;
  targetYear?: number;
  periodHours?: number;
  engineName?: string;
  typeLabel?: string;
  excludedTypeLabels: string[];
  status?: AssistantStatusFilter;
}

function listParam(value: string | null): string[] {
  return [...new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 100);
}

function statusParam(value: string | null): AssistantStatusFilter | undefined {
  return value === "overdue" || value === "critical" || value === "upcoming" || value === "normal" ? value : undefined;
}

function statusKey(status: AssistantStatusFilter): MaintenanceForecastRow["status"] {
  return status === "overdue" ? "gecikmis" : status === "critical" ? "kritik" : status === "upcoming" ? "yaklasiyor" : "normal";
}

export async function buildForecastExportContext(db: Db, searchParams: URLSearchParams): Promise<ForecastExportContext> {
  const targetYear = validForecastYear(searchParams.get("target_year"));
  const periodHours = validMaintenancePeriodHours(searchParams.get("maintenance_period_hours"));
  const engineId = searchParams.get("engine_id")?.trim() || undefined;
  const typeLabel = searchParams.get("type_label")?.trim() || undefined;
  const excludedTypeLabels = listParam(searchParams.get("exclude_type_label"));
  const status = statusParam(searchParams.get("status"));
  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1 } }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  const selectedEngine = engineId ? engines.find((engine) => String(engine._id) === engineId || engine.name === engineId) : undefined;
  const rows = buildMaintenanceForecastRows(engines, types, {
    targetYear,
    maintenancePeriodHours: periodHours,
    engineId: selectedEngine ? String(selectedEngine._id) : engineId,
    typeLabel,
    excludedTypeLabels,
  });
  // Forecast responses intentionally keep backlog when “overdue” is present; other status filters are exact.
  const filteredRows = status && status !== "overdue" ? rows.filter((row) => row.status === statusKey(status)) : rows;
  return {
    rows: filteredRows,
    summary: summarizeMaintenanceForecast(filteredRows, targetYear),
    targetYear,
    periodHours,
    engineName: selectedEngine?.name || (engineId ? engineId : undefined),
    typeLabel,
    excludedTypeLabels,
    status,
  };
}

export function forecastExportTitle(context: ForecastExportContext): string {
  if (context.periodHours) return `${context.periodHours.toLocaleString("tr-TR")} Saatlik Bakım Tahmin Raporu`;
  if (context.targetYear) return `${context.targetYear} Bakım Tahmin Planı`;
  return "Bakım Tahmin Planı";
}
