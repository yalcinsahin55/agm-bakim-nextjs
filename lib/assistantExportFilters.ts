import type { AssistantToolResponse } from "@/lib/assistantTools";

export function applyForecastExclusions(result: AssistantToolResponse, excluded: string[]): AssistantToolResponse {
  if (result.intent !== "maintenance_forecast" || excluded.length === 0) return result;
  const data = { ...result.data };
  const items = Array.isArray(data.items) ? data.items : [];
  const visibleItems = items.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const type = String((item as Record<string, unknown>).type || "");
    return !excluded.some((value) => value.localeCompare(type, "tr", { sensitivity: "base" }) === 0);
  });
  const isOverdue = (item: unknown) => item && typeof item === "object" && String((item as Record<string, unknown>).category) === "overdue";
  data.items = visibleItems;
  data.total = visibleItems.length;
  data.overdue_count = visibleItems.filter(isOverdue).length;
  data.scheduled_count = visibleItems.length - Number(data.overdue_count || 0);
  const targetYear = Number(data.target_year || 0);
  data.target_year_count = targetYear > 0 ? visibleItems.filter((item) => item && typeof item === "object" && Number((item as Record<string, unknown>).forecast_year) === targetYear).length : 0;
  data.before_target_year_count = targetYear > 0 ? visibleItems.filter((item) => item && typeof item === "object" && String((item as Record<string, unknown>).category) === "before_target_year").length : 0;
  return { ...result, summary: `${result.summary} Hariç tutulan bakım türleri: ${excluded.join(", ")}.`, data };
}

export function typeIsExcluded(value: unknown, excluded: string[]): boolean {
  return typeof value === "string" && excluded.some((item) => item.localeCompare(value, "tr", { sensitivity: "base" }) === 0);
}

export function applyExportTypeExclusions(result: AssistantToolResponse, excluded: string[]): AssistantToolResponse {
  if (excluded.length === 0) return result;
  if (result.intent === "maintenance_forecast") return applyForecastExclusions(result, excluded);
  const data = { ...result.data };
  if (Array.isArray(data.items)) {
    data.items = data.items.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return !typeIsExcluded(record.type, excluded) && !typeIsExcluded(record.type_label, excluded);
    });
  }
  if (Array.isArray(data.types)) {
    data.types = data.types.filter((item) => item && typeof item === "object" && !typeIsExcluded((item as Record<string, unknown>).type, excluded));
  }
  if (Array.isArray(data.daily_records)) {
    data.daily_records = data.daily_records.map((item) => {
      if (!item || typeof item !== "object") return item;
      const record = item as Record<string, unknown>;
      const types = Array.isArray(record.types) ? record.types.filter((type) => !typeIsExcluded(type, excluded)) : record.types;
      return { ...record, ...(Array.isArray(types) ? { types, count: types.length } : {}) };
    }).filter((item) => !item || typeof item !== "object" || !Array.isArray((item as Record<string, unknown>).types) || ((item as Record<string, unknown>).types as unknown[]).length > 0);
  }
  if (result.intent === "overdue") {
    data.count = Array.isArray(data.items) ? data.items.length : 0;
    data.displayed_count = data.count;
  }
  if (result.intent === "maintenance_health") {
    const counts = Array.isArray(data.items) ? data.items.reduce<Record<string, number>>((accumulator, item) => {
      const status = item && typeof item === "object" ? String((item as Record<string, unknown>).status || "normal") : "normal";
      accumulator[status] = (accumulator[status] || 0) + 1;
      return accumulator;
    }, {}) : {};
    data.counts = counts;
  }
  return { ...result, summary: `${result.summary} Hariç tutulan bakım türleri: ${excluded.join(", ")}.`, data };
}

