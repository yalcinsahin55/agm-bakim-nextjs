import type {
  AssistantEvidenceFilter,
  AssistantQuery,
  AssistantRecordFilter,
  AssistantSourceFilter,
  AssistantStatusFilter,
  AssistantTechnicianRole,
} from "./assistantPolicyTypes.ts";
import {
  EXTERNAL_SERVICE_PATTERNS,
  INTERNAL_SOURCE_PATTERNS,
} from "./assistantPolicyPatterns.ts";
import { extractMaintenancePeriodHours, parseRange } from "./assistantPolicyNumbers.ts";

export function extractMaintenanceTypeQuery(question: string): string | undefined {
  const explicit = question.match(/bakım\s+türü\s*[:=-]\s*(.+?)(?=\s+(?:\d{4}|dış\s+hizmet|iç\s+ekip|fotoğraflı|videolu|not\s+içeren|ekip|hangi\s+motorlarda|motorlarda|hangi\s+bakımlarda)|\?|$)/iu);
  if (explicit?.[1]?.trim()) return explicit[1].trim();
  const natural = question.match(/^(.{2,80}?)\s+bakım(?:ı|ını|ları|larını)?\s+(?:hangi\s+motorlarda|nerede|kaç)/iu)
    || question.match(/(?:hangi\s+motorlarda|motorlarda)\s+(.{2,80}?)\s+bakım(?:ı|ını|ları|larını)?\s+(?:yapıldı|yapılmış|gerçekleşti|var)/iu)
    || question.match(/^(.{2,80}?)\s+bakım(?:ı|ını|ları|larını)?\s+yap(?:ıldı|ılan)\s+motorlar?/iu);
  const byEngine = question.match(/\b(?:agm[-\s]?\d{1,3}|motor(?:un|da|için)?)\b(?:['’]?[a-zçğıöşü]+)?\s+(.{2,80}?)\s+bakım(?:ı|ını|ları|larını|ında|inde)?\s+(?:için|ne\s+kadar|kaç(?:\s+saat)?|kaldı|çalış)/iu);
  const candidate = (natural?.[1] || byEngine?.[1])?.trim();
  if (!candidate) return undefined;
  return candidate
    .replace(/^\s*(?:agm[-\s]?\d{1,3}|motor(?:un|da|için)?)\b(?:['’]?[a-zçğıöşü]+)?\s*/iu, "")
    .replace(/^(?:için|üzerinde|hakkında)\s+/iu, "")
    .trim() || undefined;
}

export function extractServiceQuery(question: string): string | undefined {
  const explicit = question.match(/(?:servis|firma)\s*(?:adı)?\s*[:=-]\s*([^;,?]+)/iu);
  if (explicit?.[1]?.trim()) return explicit[1].trim();
  const namedService = question.match(/\b([a-zçğıöşü0-9][a-zçğıöşü0-9 ._-]{1,60}?)\s+servisi?\b/iu);
  if (namedService && !/^(dış|harici)$/iu.test(namedService[1].trim())) return namedService[1].trim();
  return undefined;
}

export function parseFilters(question: string): Pick<AssistantQuery, "maintenanceTypeQuery" | "maintenancePeriodHours" | "serviceQuery" | "technicianRole" | "sourceFilter" | "evidenceFilter" | "statusFilter" | "recordFilters" | "hourRange" | "durationRange" | "teamOnly" | "unreadOnly" | "showAll"> {
  const technicianRole: AssistantTechnicianRole | undefined = /yardımcı|destek|ekip\s+üyesi/iu.test(question) ? "support" : /sorumlu|yetkili/iu.test(question) ? "responsible" : undefined;
  const sourceFilter: AssistantSourceFilter | undefined = INTERNAL_SOURCE_PATTERNS.some((pattern) => pattern.test(question)) ? "internal" : EXTERNAL_SERVICE_PATTERNS.some((pattern) => pattern.test(question)) ? "external_service" : undefined;
  const evidenceFilter: AssistantEvidenceFilter | undefined = /fotoğraf|fotoğraflı/iu.test(question) ? "photo" : /video|videolu/iu.test(question) ? "video" : /notu|notlu|not\s+içeren/iu.test(question) ? "note" : /kontrol\s+listesi/iu.test(question) ? "checklist" : undefined;
  const statusFilter: AssistantStatusFilter | undefined = /gecikmiş|geciken|vadesi\s+geç/iu.test(question) ? "overdue" : /kritik/iu.test(question) ? "critical" : /yaklaşan|yaklaşıyor/iu.test(question) ? "upcoming" : /normal\s+durum/iu.test(question) ? "normal" : undefined;
  const recordFilters: AssistantRecordFilter[] = [];
  if (/geriye\s+dönük|sonradan\s+girilen|backdated/iu.test(question)) recordFilters.push("backdated");
  if (/başlangıç.*(?:eksik|yok)|bitiş.*(?:eksik|yok)|zaman\s+bilgisi.*(?:eksik|yok)|saat\s+bilgisi.*(?:eksik|yok)/iu.test(question)) recordFilters.push("missing_time");
  if (/(?:teyit|teyidi)\s*(?:edilmemiş|bekleyen|yok|olmayan)|onaylanmamış|doğrulanmamış/iu.test(question)) recordFilters.push("unconfirmed");
  const durationQuestion = /süre|süren|dakika|saatten\s+(?:fazla|uzun)|uzun\s+süren/iu.test(question);
  const hourRange = !durationQuestion && (/motor\s+saati|çalışma\s+saati|motor\s+saatinde|\d[\d.,]*\s*saat\s*(?:ile|-|–)\s*\d[\d.,]*\s*saat/iu.test(question)) ? parseRange(question, "saat(?:i)?") : undefined;
  const rawDurationRange = durationQuestion ? parseRange(question, "(?:dakika|saat)") : undefined;
  const durationInHours = Boolean(rawDurationRange && /saat/iu.test(question) && !/motor\s+saati|çalışma\s+saati/iu.test(question));
  const durationRange = rawDurationRange ? Object.fromEntries(Object.entries(rawDurationRange).map(([key, value]) => [key, durationInHours ? Number(value) * 60 : value])) as { min?: number; max?: number } : undefined;
  const teamOnly = /\bekip\b|birlikte\s+çalış|birden\s+fazla\s+teknisyen|diğer\s+teknisyen/iu.test(question) ? true : undefined;
  const unreadOnly = /okunmamış|okunmayan|okumadığım/iu.test(question) ? true : undefined;
  const showAll = /(?:tümünü|hepsini|tamamını)\s+(?:göster|listele|getir)|tüm\s+(?:kayıtları|bakımları|raporları)/iu.test(question) ? true : undefined;
  const maintenancePeriodHours = extractMaintenancePeriodHours(question);
  return { maintenanceTypeQuery: maintenancePeriodHours ? undefined : extractMaintenanceTypeQuery(question), maintenancePeriodHours, serviceQuery: extractServiceQuery(question), technicianRole, sourceFilter, evidenceFilter, statusFilter, recordFilters: recordFilters.length ? recordFilters : undefined, hourRange, durationRange, teamOnly, unreadOnly, showAll };
}
