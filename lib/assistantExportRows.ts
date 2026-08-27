import type { AssistantToolResponse } from "@/lib/assistantTools";
import { exportColumnLabel, exportSheetLabel, getAvailableColumns, getExportColumnValue, type AssistantExportOptions, type ExportColumnId } from "@/lib/assistantExport";

export const MAX_EXPORT_ROWS = 500;
export type ExportRow = Record<string, unknown>;

export function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "rapor";
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("tr-TR");
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("tr-TR") : "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatValue(item)}`)
      .join(" · ");
  }
  return String(value);
}

export function displayLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const INTENT_ARRAY_KEYS: Record<string, string[]> = {
  summary: ["by_engine", "by_type", "daily_records"],
  overdue: ["items"],
  engine_history: ["records"],
  technician_performance: ["activities", "by_type", "by_engine", "technicians"],
  external_service: ["services", "engines"],
  maintenance_forecast: ["items"],
  engine_data: ["engines"],
  maintenance_catalog: ["types"],
  pressure_readings: ["readings"],
  oil_analysis: ["analyses"],
  equipment_info: ["infos"],
  technician_directory: ["technicians"],
  notification_summary: ["notifications"],
  maintenance_health: ["items"],
  performance_daily: ["performance_daily"],
};

export function isEmptyExportValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function scalarRows(result: AssistantToolResponse): ExportRow[] {
  const selectedTechnician = result.data.selected_technician && typeof result.data.selected_technician === "object" ? result.data.selected_technician as Record<string, unknown> : null;
  const isSelectedTechnician = result.intent === "technician_performance" && Boolean(selectedTechnician);
  const globalTechnicianFields = new Set(["total_tasks", "total_responsible_tasks", "total_support_tasks", "total_duration_minutes", "total_duration_text", "top_technician"]);
  const rows = Object.entries(result.data)
    .filter(([key, value]) => !isEmptyExportValue(value) && !Array.isArray(value) && (typeof value !== "object" || value === null) && !(isSelectedTechnician && globalTechnicianFields.has(key)))
    .map(([key, value]) => ({ Alan: displayLabel(key), Değer: formatValue(value) }));
  if (selectedTechnician) {
    for (const key of ["full_name", "technician_type", "responsible_tasks", "support_tasks", "total_tasks", "duration_minutes", "duration_text"]) {
      if (selectedTechnician[key] !== undefined) rows.push({ Alan: displayLabel(key), Değer: formatValue(selectedTechnician[key]) });
    }
  }
  const topTechnician = result.data.top_technician && typeof result.data.top_technician === "object" ? result.data.top_technician as Record<string, unknown> : null;
  if (topTechnician && !selectedTechnician) {
    rows.push({ Alan: "En Çok Görev Alan Teknisyen", Değer: formatValue(topTechnician.full_name) });
    rows.push({ Alan: "En Çok Görev Alan Teknisyen Görevi", Değer: formatValue(topTechnician.total_tasks) });
  }
  return rows;
}

export function comparableExportValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/ı/g, "i").toLocaleLowerCase("tr-TR").trim();
}

export function sortExportItems(items: unknown[], sort: AssistantExportOptions["sort"]): unknown[] {
  const key = sort === "engine" ? "engine" : sort === "type" ? "type" : sort === "technician" ? "technician" : "date";
  return [...items].sort((left, right) => {
    const a = left && typeof left === "object" ? getExportColumnValue(left as Record<string, unknown>, key === "date" ? "date" : key) : "";
    const b = right && typeof right === "object" ? getExportColumnValue(right as Record<string, unknown>, key === "date" ? "date" : key) : "";
    const aValue = key === "date" ? new Date(String(a || "")).getTime() || 0 : comparableExportValue(a);
    const bValue = key === "date" ? new Date(String(b || "")).getTime() || 0 : comparableExportValue(b);
    if (aValue < bValue) return sort === "date_desc" ? 1 : -1;
    if (aValue > bValue) return sort === "date_desc" ? -1 : 1;
    return 0;
  });
}

export function distributionDetails(value: unknown, labelKey: "type" | "engine"): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const details = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = record[labelKey];
    if (typeof label !== "string" || !label.trim()) return [];
    const count = typeof record.count === "number" && Number.isFinite(record.count) ? ` (${record.count.toLocaleString("tr-TR")})` : "";
    return [`${label.trim()}${count}`];
  });
  return details.length ? details.join(", ") : null;
}

export function sheetColumnValue(record: Record<string, unknown>, column: ExportColumnId, sheetKey: string): unknown {
  if (sheetKey === "by_engine" && column === "type") return distributionDetails(record.type_stats, "type");
  if (sheetKey === "by_type" && column === "engine") return distributionDetails(record.engines, "engine");
  return getExportColumnValue(record, column);
}

export function arraySheets(result: AssistantToolResponse, options: AssistantExportOptions): Array<{ name: string; rows: ExportRow[] }> {
  const keys = options.sheets.length ? options.sheets : INTENT_ARRAY_KEYS[result.intent] || [];
  const columns = options.columns.length ? options.columns : getAvailableColumns(result.intent);
  return keys.flatMap((key) => {
    const value = result.data[key];
    if (!Array.isArray(value) || value.length === 0) return [];
    const values = sortExportItems(value.slice(0, MAX_EXPORT_ROWS), options.sort);
    const records = values.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    const effectiveColumns = columns.filter((column) => records.some((record) => !isEmptyExportValue(sheetColumnValue(record, column, key))));
    const rows = values.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return Object.fromEntries(effectiveColumns.map((column) => [exportColumnLabel(column), formatValue(sheetColumnValue(record, column, key))]));
      }
      return { Değer: formatValue(item) };
    });
    return [{ name: exportSheetLabel(key), rows }];
  });
}

export function uniqueSheetName(label: string, used: Set<string>): string {
  const base = label.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Sonuçlar";
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const suffixText = ` (${suffix})`;
    name = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

export function reportTitle(result: AssistantToolResponse): string {
  return result.title || "Bakım Asistanı Raporu";
}

