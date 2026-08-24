import type { Engine, MaintenanceType } from "@/lib/types";
import { buildItems, engineSortKey, STATUS_LABELS, type PanelItem } from "@/lib/status";

export const FORECAST_DAILY_ENGINE_HOURS = 24;
export const MAX_FORECAST_ROWS = 5_000;

export type MaintenanceForecastCategory = "overdue" | "before_target_year" | "target_year" | "current_plan";

export interface MaintenanceForecastRow {
  engine_id: string;
  engine: string;
  type_key: string;
  type: string;
  current_hours: number;
  last_maintenance_hours: number;
  period_hours: number;
  remaining_hours: number;
  overdue_hours: number;
  status: PanelItem["status"];
  status_label: string;
  estimated_date: string;
  estimated_date_label: string;
  forecast_year: number;
  category: MaintenanceForecastCategory;
}

export interface MaintenanceForecastOptions {
  targetYear?: number;
  maintenancePeriodHours?: number;
  engineId?: string;
  typeLabel?: string;
  excludedTypeLabels?: string[];
  now?: Date;
}

export interface MaintenanceForecastSummary {
  current_date: string;
  current_year: number;
  target_year: number | null;
  horizon_end: string | null;
  total: number;
  overdue_count: number;
  scheduled_count: number;
  before_target_year_count: number;
  target_year_count: number;
  grouped_by_period: Array<{ period_hours: number; count: number }>;
  assumptions: { daily_engine_hours: number; formula: string };
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function validForecastYear(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : undefined;
}

export function validMaintenancePeriodHours(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 100_000 ? parsed : undefined;
}

export function turkeyDateKey(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dateKeyLabel(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : value;
}

export function estimatedMaintenanceDateKey(remainingHours: number, now = new Date()): string {
  const estimatedDate = new Date(`${turkeyDateKey(now)}T00:00:00.000Z`);
  estimatedDate.setUTCDate(estimatedDate.getUTCDate() + Math.round(remainingHours / FORECAST_DAILY_ENGINE_HOURS));
  return estimatedDate.toISOString().slice(0, 10);
}

export function buildMaintenanceForecastRows(
  engines: Engine[],
  types: MaintenanceType[],
  options: MaintenanceForecastOptions = {},
): MaintenanceForecastRow[] {
  const targetYear = validForecastYear(options.targetYear);
  const horizonEnd = targetYear ? `${targetYear}-12-31` : null;
  const periodHours = validMaintenancePeriodHours(options.maintenancePeriodHours);
  const typeLabel = options.typeLabel ? normalizeLabel(options.typeLabel) : null;
  const excludedLabels = new Set((options.excludedTypeLabels || []).map(normalizeLabel).filter(Boolean));
  const now = options.now || new Date();

  return buildItems(engines, types)
    .filter((item) => !options.engineId || item.engine_id === options.engineId)
    .filter((item) => !typeLabel || normalizeLabel(item.type_label) === typeLabel)
    .filter((item) => periodHours === undefined || Math.round(item.period) === periodHours)
    .filter((item) => !excludedLabels.has(normalizeLabel(item.type_label)))
    .map((item: PanelItem): MaintenanceForecastRow => {
      const estimatedDate = estimatedMaintenanceDateKey(item.remaining, now);
      const forecastYear = Number(estimatedDate.slice(0, 4));
      const overdue = item.remaining <= 0;
      return {
        engine_id: item.engine_id,
        engine: item.engine_name,
        type_key: item.type_key,
        type: item.type_label,
        current_hours: Math.round(item.engine_hours),
        last_maintenance_hours: Math.round(item.last_hour),
        period_hours: Math.round(item.period),
        remaining_hours: Math.round(item.remaining),
        overdue_hours: Math.max(0, Math.round(Math.abs(item.remaining))),
        status: item.status,
        status_label: STATUS_LABELS[item.status],
        estimated_date: estimatedDate,
        estimated_date_label: dateKeyLabel(estimatedDate),
        forecast_year: forecastYear,
        category: overdue ? "overdue" : targetYear !== undefined && forecastYear < targetYear ? "before_target_year" : targetYear !== undefined ? "target_year" : "current_plan",
      };
    })
    .filter((item) => item.category === "overdue" || !horizonEnd || item.estimated_date <= horizonEnd)
    .sort((a, b) => (a.category === "overdue" ? -1 : 1) - (b.category === "overdue" ? -1 : 1) || a.estimated_date.localeCompare(b.estimated_date) || engineSortKey(a.engine) - engineSortKey(b.engine) || a.type.localeCompare(b.type, "tr"))
    .slice(0, MAX_FORECAST_ROWS);
}

export function summarizeMaintenanceForecast(rows: MaintenanceForecastRow[], targetYear?: number): MaintenanceForecastSummary {
  const validTargetYear = validForecastYear(targetYear);
  const overdueCount = rows.filter((item) => item.category === "overdue").length;
  const beforeTargetYearCount = validTargetYear === undefined ? 0 : rows.filter((item) => item.category === "before_target_year").length;
  const targetYearCount = validTargetYear === undefined ? 0 : rows.filter((item) => item.forecast_year === validTargetYear).length;
  const grouped = Object.values(rows.reduce<Record<string, { period_hours: number; count: number }>>((groups, item) => {
    const key = String(item.period_hours);
    groups[key] = groups[key] || { period_hours: item.period_hours, count: 0 };
    groups[key].count += 1;
    return groups;
  }, {})).sort((a, b) => a.period_hours - b.period_hours);
  const currentDate = turkeyDateKey();
  return {
    current_date: currentDate,
    current_year: Number(currentDate.slice(0, 4)),
    target_year: validTargetYear ?? null,
    horizon_end: validTargetYear ? `${validTargetYear}-12-31` : null,
    total: rows.length,
    overdue_count: overdueCount,
    scheduled_count: rows.length - overdueCount,
    before_target_year_count: beforeTargetYearCount,
    target_year_count: targetYearCount,
    grouped_by_period: grouped,
    assumptions: { daily_engine_hours: FORECAST_DAILY_ENGINE_HOURS, formula: "kalan_motor_saati / 24 = yaklaşık gün" },
  };
}
