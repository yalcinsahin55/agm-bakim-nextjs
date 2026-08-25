export type AssistantExportPreset = "summary" | "detail" | "audit" | "raw";
export type AssistantExportOrientation = "portrait" | "landscape";
export type AssistantExportPageSize = "A4" | "A3";
export type AssistantExportMargin = "normal" | "narrow";
export type AssistantExportSort = "date_desc" | "date_asc" | "engine" | "type" | "technician";
export type ExportColumnId =
  | "date"
  | "engine"
  | "type"
  | "hours"
  | "load_kw"
  | "start"
  | "end"
  | "duration"
  | "technician"
  | "role"
  | "team"
  | "source"
  | "service"
  | "status"
  | "count"
  | "measurements"
  | "period_hours"
  | "remaining"
  | "worked_hours"
  | "attachments"
  | "forecast_date"
  | "category"
  | "note";

export type AssistantExportOptions = {
  preset: AssistantExportPreset;
  columns: ExportColumnId[];
  sheets: string[];
  orientation: AssistantExportOrientation;
  pageSize: AssistantExportPageSize;
  margin: AssistantExportMargin;
  sort: AssistantExportSort;
  includeLogo: boolean;
  includeFooter: boolean;
  logoUrl: string | null;
  excludedTypes: string[];
};

export type ExportData = {
  intent: string;
  data: Record<string, unknown>;
};

export const EXPORT_COLUMN_LABELS: Record<ExportColumnId, string> = {
  date: "Tarih",
  engine: "Motor",
  type: "Bakım türü",
  hours: "Motor saati",
  load_kw: "Yük (kW)",
  start: "Başlangıç",
  end: "Bitiş",
  duration: "Süre",
  technician: "Teknisyen",
  role: "Katkı rolü",
  team: "Ekip",
  source: "Kaynak",
  service: "Servis",
  status: "Durum",
  count: "Adet",
  measurements: "Ölçüm adedi",
  period_hours: "Periyot",
  remaining: "Kalan/gecikme",
  worked_hours: "Son bakımdan beri motor çalışması",
  attachments: "Rapor ekleri",
  forecast_date: "Tahmini tarih",
  category: "Plan kategorisi",
  note: "Not",
};

const ALL_COLUMNS = Object.keys(EXPORT_COLUMN_LABELS) as ExportColumnId[];

const INTENT_COLUMNS: Record<string, ExportColumnId[]> = {
  summary: ["date", "engine", "type", "duration", "source", "count"],
  overdue: ["engine", "type", "hours", "period_hours", "remaining", "status"],
  engine_history: ["date", "engine", "type", "hours", "technician", "start", "end", "duration", "attachments"],
  technician_performance: ["date", "engine", "type", "technician", "role", "duration", "count"],
  external_service: ["date", "engine", "type", "service", "technician", "duration", "source"],
  maintenance_forecast: ["engine", "type", "period_hours", "hours", "remaining", "forecast_date", "status", "category"],
  engine_data: ["date", "engine", "hours", "load_kw", "measurements", "status"],
  maintenance_catalog: ["engine", "type", "period_hours", "status"],
  pressure_readings: ["date", "engine", "load_kw", "status", "note"],
  oil_analysis: ["date", "engine", "status", "note"],
  equipment_info: ["engine", "note"],
  technician_directory: ["technician", "role", "status"],
  notification_summary: ["date", "engine", "type", "status", "note"],
  maintenance_health: ["engine", "type", "hours", "period_hours", "worked_hours", "duration", "remaining", "status"],
};

const INTENT_SHEETS: Record<string, string[]> = {
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
};

export const EXPORT_SHEET_LABELS: Record<string, string> = {
  by_engine: "Motor dağılımı",
  by_type: "Bakım türü dağılımı",
  daily_records: "Gün gün bakımlar",
  performance_daily: "Günlük motor performansı",
  items: "Sonuçlar",
  records: "Bakım geçmişi",
  activities: "Çalışılan bakımlar",
  technicians: "Teknisyenler",
  services: "Dış servisler",
  engines: "Motorlar",
  types: "Bakım türleri",
  readings: "Karter basıncı",
  analyses: "Yağ analizleri",
  infos: "Motor bilgi kartları",
  notifications: "Bildirimler",
};

function selectedTechnician(data: Record<string, unknown>): boolean {
  return Boolean(data.selected_technician && typeof data.selected_technician === "object");
}

export function getAvailableSheetKeys(intent: string, data: Record<string, unknown>): string[] {
  if (intent === "technician_performance" && selectedTechnician(data)) return ["activities", "by_type", "by_engine"];
  if (intent === "engine_data" && data.performance_mode === true) return ["performance_daily"];
  const configured = INTENT_SHEETS[intent] || [];
  const available = configured.filter((key) => Array.isArray(data[key]));
  if (available.length) return available;
  return Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([key]) => key).slice(0, 8);
}

export function getAvailableColumns(intent: string): ExportColumnId[] {
  return INTENT_COLUMNS[intent] || ["date", "engine", "type", "technician", "duration", "status", "note"];
}

export function getPresetOptions(intent: string, data: Record<string, unknown>, preset: AssistantExportPreset): Pick<AssistantExportOptions, "columns" | "sheets"> {
  const columns = getAvailableColumns(intent);
  const availableSheets = getAvailableSheetKeys(intent, data);
  if (preset === "summary") {
    const summarySheets = availableSheets.filter((key) => ["by_engine", "by_type", "performance_daily"].includes(key));
    return { columns: columns.filter((column) => ["date", "engine", "type", "count", "duration", "status", "remaining", "hours", "load_kw", "measurements", "forecast_date"].includes(column)), sheets: summarySheets.length ? summarySheets : availableSheets };
  }
  if (preset === "audit") {
    return { columns: columns.filter((column) => ["date", "engine", "type", "technician", "role", "team", "source", "status", "duration", "note"].includes(column)), sheets: availableSheets };
  }
  if (preset === "raw") return { columns: ALL_COLUMNS.filter((column) => columns.includes(column)), sheets: availableSheets };
  return { columns, sheets: availableSheets };
}

export function getDefaultExportOptions(intent: string, data: Record<string, unknown>): AssistantExportOptions {
  const preset: AssistantExportPreset = intent === "maintenance_forecast" ? "summary" : "detail";
  const selected = getPresetOptions(intent, data, preset);
  return {
    preset,
    columns: selected.columns.length ? selected.columns : getAvailableColumns(intent),
    sheets: selected.sheets,
    orientation: "portrait",
    pageSize: "A4",
    margin: "normal",
    sort: "date_desc",
    includeLogo: true,
    includeFooter: true,
    logoUrl: null,
    excludedTypes: [],
  };
}

export function normalizeExportOptions(intent: string, data: Record<string, unknown>, raw: Partial<Record<string, string | null>>): AssistantExportOptions {
  const fallback = getDefaultExportOptions(intent, data);
  const rawPreset = raw.preset;
  const preset: AssistantExportPreset = rawPreset === "summary" || rawPreset === "detail" || rawPreset === "audit" || rawPreset === "raw" ? rawPreset : fallback.preset;
  const presetOptions = getPresetOptions(intent, data, preset);
  const validColumns = new Set(getAvailableColumns(intent));
  const validSheets = new Set(getAvailableSheetKeys(intent, data));
  const columns = String(raw.columns || "").split(",").map((value) => value.trim()).filter((value): value is ExportColumnId => validColumns.has(value as ExportColumnId)).slice(0, 20);
  const sheets = String(raw.sheets || "").split(",").map((value) => value.trim()).filter((value) => validSheets.has(value)).slice(0, 12);
  const orientation: AssistantExportOrientation = raw.orientation === "landscape" ? "landscape" : "portrait";
  const pageSize: AssistantExportPageSize = raw.page_size === "A3" ? "A3" : "A4";
  const margin: AssistantExportMargin = raw.margin === "narrow" ? "narrow" : "normal";
  const sort: AssistantExportSort = raw.sort === "date_asc" || raw.sort === "engine" || raw.sort === "type" || raw.sort === "technician" ? raw.sort : "date_desc";
  const excludedTypes = String(raw.exclude_type_label || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 30);
  const logoUrl = typeof raw.logo_url === "string" && /^https:\/\/(?:[a-z0-9-]+\.)*public\.blob\.vercel-storage\.com\//i.test(raw.logo_url) ? raw.logo_url : null;
  return {
    preset,
    columns: columns.length ? columns : (presetOptions.columns.length ? presetOptions.columns : fallback.columns),
    sheets: sheets.length ? sheets : presetOptions.sheets,
    orientation,
    pageSize,
    margin,
    sort,
    includeLogo: raw.include_logo !== "0",
    includeFooter: raw.include_footer !== "0",
    logoUrl,
    excludedTypes,
  };
}

function nestedDistributionLabel(value: unknown, labelKey: "type" | "engine"): string | null {
  if (!Array.isArray(value)) return null;
  const labels = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = record[labelKey];
    if (typeof label !== "string" || !label.trim()) return [];
    const count = typeof record.count === "number" && Number.isFinite(record.count) ? ` (${record.count.toLocaleString("tr-TR")})` : "";
    return [`${label.trim()}${count}`];
  });
  return labels.length ? labels.join(", ") : null;
}

export function getExportColumnValue(row: Record<string, unknown>, column: ExportColumnId): unknown {
  const value = (key: string) => row[key];
  switch (column) {
    case "date": return value("date") ?? value("created_at") ?? value("updated_at") ?? value("reading_date") ?? value("analysis_date");
    case "engine": return value("engine") ?? value("engine_name") ?? value("selected_engine") ?? nestedDistributionLabel(value("engines"), "engine");
    case "type": return value("type") ?? value("type_label") ?? value("maintenance_type") ?? value("types") ?? nestedDistributionLabel(value("type_stats"), "type");
    case "hours": return value("hours") ?? value("engine_hours") ?? value("hour_at_completion") ?? value("current_hours");
    case "load_kw": return value("load_kw") ?? value("average_load_kw");
    case "start": return value("start_at") ?? value("maintenance_start_at");
    case "end": return value("end_at") ?? value("maintenance_end_at");
    case "duration": return value("duration_minutes") ?? value("maintenance_duration_minutes") ?? value("duration_text");
    case "technician": return value("technician") ?? value("technician_name") ?? value("full_name");
    case "role": return value("role") ?? value("contribution_role") ?? value("technician_role");
    case "team": return value("team") ?? value("other_technicians");
    case "source": return value("source") ?? value("technician_source");
    case "service": return value("service") ?? value("external_service_name");
    case "status": return value("status_label") ?? value("status") ?? value("manager_confirmation_status");
    case "count": return value("count") ?? value("total_tasks") ?? value("total_records") ?? value("responsible_count") ?? value("support_count");
    case "measurements": return value("measurements") ?? value("performance_observations");
    case "period_hours": return value("period_hours") ?? value("default_period_hours");
    case "remaining": return value("remaining_hours") ?? value("overdue_hours");
    case "worked_hours": return value("worked_since_last_hours") ?? value("worked_hours");
    case "attachments": {
      const attachments = value("report_attachments");
      if (Array.isArray(attachments)) return attachments.map((attachment) => attachment && typeof attachment === "object" ? String((attachment as Record<string, unknown>).filename || "") : "").filter(Boolean).join(", ");
      return value("report_attachment_count") || "";
    }
    case "forecast_date": return value("estimated_date_label") ?? value("estimated_date");
    case "category": return value("category") ?? value("status_label");
    case "note": return value("note") ?? value("technician_note");
  }
}

export function exportColumnLabel(column: string): string {
  return EXPORT_COLUMN_LABELS[column as ExportColumnId] || column.replace(/_/g, " ");
}

export function exportSheetLabel(sheet: string): string {
  return EXPORT_SHEET_LABELS[sheet] || sheet.replace(/_/g, " ");
}
