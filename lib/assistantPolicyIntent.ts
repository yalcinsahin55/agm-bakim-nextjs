import type { AssistantIntent } from "./assistantPolicyTypes.ts";
import {
  ENGINE_DATA_PATTERNS,
  ENGINE_HISTORY_PATTERNS,
  EQUIPMENT_INFO_PATTERNS,
  EXTERNAL_SERVICE_PATTERNS,
  FORECAST_PATTERNS,
  INTERNAL_SOURCE_PATTERNS,
  MAINTENANCE_CATALOG_PATTERNS,
  MAINTENANCE_HEALTH_PATTERNS,
  MOTOR_PERFORMANCE_PATTERNS,
  NOTIFICATION_PATTERNS,
  OIL_ANALYSIS_PATTERNS,
  OVERDUE_PATTERNS,
  PRESSURE_PATTERNS,
  QUESTION_HELP_PATTERNS,
  RECORD_FILTER_PATTERNS,
  SUMMARY_PATTERNS,
  TECHNICIAN_DIRECTORY_PATTERNS,
  TECHNICIAN_PATTERNS,
} from "./assistantPolicyPatterns.ts";
import { currentTurkeyDateKey } from "./assistantPolicyDateRanges.ts";
import { extractMaintenancePeriodHours } from "./assistantPolicyNumbers.ts";

export function periodFromQuestion(question: string): "month" | "3months" | "year" | "all" {
  if (/bu\s+ay/iu.test(question)) return "month";
  if (/(son\s+(3|üç)\s+ay|son\s+çeyrek)/iu.test(question)) return "3months";
  if (/bu\s+yıl|bu\s+sene/iu.test(question)) return "year";
  return "all";
}

export function extractTargetYear(question: string): number | undefined {
  const explicit = question.match(/(?<!\d)((?:20|21)\d{2})(?!\d)/u);
  if (explicit) {
    const year = Number(explicit[1]);
    if (year >= 2000 && year <= 2100) return year;
  }
  if (/(?:gelecek|önümüzdeki|bir sonraki)\s+yıl/iu.test(question)) {
    return Number(currentTurkeyDateKey().slice(0, 4)) + 1;
  }
  return undefined;
}

export function extractEngineQuery(question: string): string | undefined {
  const match = question.match(/\bmotor(?:\s+(?:no|numarası)\s*|\s*#\s*|\s+)([^,?]+)/iu);
  const reverseMatch = !match ? question.match(/\b([a-zçğıöşü0-9][a-zçğıöşü0-9 _-]{1,60}?)\s+motor(?:u|un|unda|ünde|ında|inde|da|de|ta|te)?\b/iu) : null;
  const namedEngineMatch = question.match(/\b(agm[-\s]?\d{1,3})\b/iu);
  // AGM-7/AGM 7 gibi açık motor adlarını, “motor teknik bilgi...” gibi
  // genel ifadelerden önce tercih et.
  const rawCandidate = namedEngineMatch?.[1] || match?.[1] || reverseMatch?.[1];
  if (!rawCandidate) return undefined;
  let candidate = rawCandidate.trim();
  if (reverseMatch && !match) {
    candidate = candidate.replace(/^.*\barasında\s+/iu, "");
    candidate = candidate.replace(/^.*\b(?:için|üzerinde|ile|ve)\s+/iu, "");
  }
  candidate = candidate.replace(/\s+(?:(?:\d{1,2}[./-]\d{1,2}[./-]\d{4})|(?:\d{4}[-.]\d{2}[-.]\d{2})).*$/iu, "");
  const boundedCandidate = candidate.split(/\s+(?=ile\b|arasında\b|üzerinde\b|bak(?:ım|ımları|ımlarını|ımı)?\b|geçmiş(?:i|ine)?\b|durum(?:u)?\b|sağlığı\b|kalan\b|sayısı\b|istatistiği\b|raporu\b|için\b|hangileri\b|kaç\b|hangi\b|çalışma\b|saat(?:i|leri)?\b|yük(?:ü|leri)?\b|teknik\b|bilgi(?:si|leri)?\b|kart(?:ı|ları)?\b|dağılımı\b)/iu)[0]?.trim();
  if (boundedCandidate) candidate = boundedCandidate;
  if (/^(?:agm|bakım|bakımları|geçmişi|durumu|sağlığı|kalan|sayısı|istatistiği|raporu|için|hangileri|var|larda|motorlar?|motorların|çalışma|çalışma\s+saatleri|saat|saatleri|yük|yükü|yükü\s+bilgisi|teknik|bilgi|bilgileri|kart|kartları|durum|dağılımı)$/iu.test(candidate)) return undefined;
  if (/^(?:teknik\s+bilgi|bilgi\s+kart(?:ı|ları)?|bakım\s+(?:sağlığı|durumu|takibi)|çalışma\s+saat(?:i|leri)?|yük(?:ü|leri)?|kalan\s+saat)/iu.test(candidate)) return undefined;
  return candidate;
}

export function inferIntent(question: string): AssistantIntent {
  if (QUESTION_HELP_PATTERNS.some((pattern) => pattern.test(question))) return "help";
  if (FORECAST_PATTERNS.some((pattern) => pattern.test(question))) return "maintenance_forecast";
  if (MAINTENANCE_CATALOG_PATTERNS.some((pattern) => pattern.test(question))) return "maintenance_catalog";
  if (OIL_ANALYSIS_PATTERNS.some((pattern) => pattern.test(question))) return "oil_analysis";
  if (PRESSURE_PATTERNS.some((pattern) => pattern.test(question))) return "pressure_readings";
  if (EQUIPMENT_INFO_PATTERNS.some((pattern) => pattern.test(question))) return "equipment_info";
  if (TECHNICIAN_DIRECTORY_PATTERNS.some((pattern) => pattern.test(question))) return "technician_directory";
  if (NOTIFICATION_PATTERNS.some((pattern) => pattern.test(question))) return "notification_summary";
  if (!INTERNAL_SOURCE_PATTERNS.some((pattern) => pattern.test(question)) && EXTERNAL_SERVICE_PATTERNS.some((pattern) => pattern.test(question))) return "external_service";
  const asksForTeam = /\bekip\b|birlikte\s+çalış|birden\s+fazla\s+teknisyen|diğer\s+teknisyen/iu.test(question);
  const engineQuery = extractEngineQuery(question);
  const asksEngineMaintenanceDuration = Boolean(engineQuery && /bakım/iu.test(question) && /(?:kaldı|ne\s+kadar|kaç\s+saat|çalış(?:tı|mış|ılan)?|harcanan)/iu.test(question));
  if (asksEngineMaintenanceDuration) return "maintenance_health";
  if (MOTOR_PERFORMANCE_PATTERNS.some((pattern) => pattern.test(question))) return "engine_data";
  if (TECHNICIAN_PATTERNS.some((pattern) => pattern.test(question)) && !EXTERNAL_SERVICE_PATTERNS.some((pattern) => pattern.test(question)) && !asksForTeam) return "technician_performance";
  const hasCombinedRecordFilter = RECORD_FILTER_PATTERNS.some((pattern) => pattern.test(question))
    || INTERNAL_SOURCE_PATTERNS.some((pattern) => pattern.test(question))
    || /fotoğraf|fotoğraflı|video|videolu|not\s+içeren|\bekip\b/iu.test(question);
  if (hasCombinedRecordFilter) return "summary";
  if (MAINTENANCE_HEALTH_PATTERNS.some((pattern) => pattern.test(question))) return "maintenance_health";
  if (extractMaintenancePeriodHours(question)) return "maintenance_forecast";
  if (ENGINE_DATA_PATTERNS.some((pattern) => pattern.test(question)) && (Boolean(engineQuery) || /\bmotor(?:lar|ların)?\b/iu.test(question))) return "engine_data";
  if (engineQuery && ENGINE_HISTORY_PATTERNS.some((pattern) => pattern.test(question))) return "engine_history";
  if (asksForTeam && /bakım/iu.test(question)) return "summary";
  if (OVERDUE_PATTERNS.some((pattern) => pattern.test(question))) return "overdue";
  if (engineQuery && ENGINE_HISTORY_PATTERNS.some((pattern) => pattern.test(question))) return "engine_history";
  if (SUMMARY_PATTERNS.some((pattern) => pattern.test(question))) return "summary";
  return "help";
}
