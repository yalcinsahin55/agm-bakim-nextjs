import { z } from "zod";

export const ASSISTANT_POLICY_VERSION = "1.3" as const;
export const MAX_ASSISTANT_QUESTION_LENGTH = 300;
export const ASSISTANT_RATE_LIMIT = 20;
export const ASSISTANT_RATE_WINDOW_MS = 10 * 60 * 1000;

export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1, "Soru boş olamaz.").max(MAX_ASSISTANT_QUESTION_LENGTH, `Soru en fazla ${MAX_ASSISTANT_QUESTION_LENGTH} karakter olabilir.`),
});

export type AssistantPeriod = "month" | "3months" | "year" | "all";
export interface AssistantDateRange {
  from: string;
  to: string;
}

export type AssistantTechnicianRole = "responsible" | "support" | "any";
export type AssistantSourceFilter = "internal" | "external_service" | "any";
export type AssistantEvidenceFilter = "photo" | "video" | "note" | "checklist";
export type AssistantStatusFilter = "overdue" | "critical" | "upcoming" | "normal";
export type AssistantRecordFilter = "backdated" | "missing_time" | "unconfirmed";

export type AssistantIntent =
  | "summary"
  | "overdue"
  | "engine_history"
  | "technician_performance"
  | "external_service"
  | "maintenance_forecast"
  | "engine_data"
  | "maintenance_catalog"
  | "pressure_readings"
  | "oil_analysis"
  | "equipment_info"
  | "technician_directory"
  | "notification_summary"
  | "maintenance_health"
  | "help";

export type AllowedAssistantTool =
  | "getMaintenanceSummary"
  | "getOverdueMaintenance"
  | "getEngineMaintenanceHistory"
  | "getTechnicianPerformance"
  | "getExternalServiceSummary"
  | "getMaintenanceForecast"
  | "getEngineData"
  | "getMaintenanceCatalog"
  | "getPressureReadings"
  | "getOilAnalysis"
  | "getEquipmentInfo"
  | "getTechnicianDirectory"
  | "getNotificationSummary"
  | "getMaintenanceHealth";

export interface AssistantQuery {
  question: string;
  intent: AssistantIntent;
  period: AssistantPeriod;
  engineQuery?: string;
  maintenanceTypeQuery?: string;
  serviceQuery?: string;
  dateRange?: AssistantDateRange;
  targetYear?: number;
  maintenancePeriodHours?: number;
  technicianRole?: AssistantTechnicianRole;
  sourceFilter?: AssistantSourceFilter;
  evidenceFilter?: AssistantEvidenceFilter;
  statusFilter?: AssistantStatusFilter;
  recordFilters?: AssistantRecordFilter[];
  hourRange?: { min?: number; max?: number };
  durationRange?: { min?: number; max?: number };
  teamOnly?: boolean;
  latestOnly?: boolean;
  unreadOnly?: boolean;
}

export interface AssistantPolicyResult {
  ok: boolean;
  question: string;
  query?: AssistantQuery;
  code?: "invalid_input" | "write_request" | "prompt_injection" | "sensitive_data" | "unsafe_diagnosis";
  message?: string;
}

const WRITE_REQUEST_PATTERNS = [
  /\b(oluştur|oluşturur musun|ekle|kaydet|sil|siler misin|düzenle|değiştir|güncelle|ata|atama yap|onayla|reddet|tamamla|bildirim gönder|mesaj gönder|yedek al|geri yükle)\b/iu,
  /\b(patch|post|put|delete|insert|update|drop|mongo(db)?|veritabanı sorgusu|api anahtarı)\b/iu,
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/iu,
  /previous\s+instructions?/iu,
  /system\s+prompt/iu,
  /developer\s+message/iu,
  /jailbreak|dan\s+mode|do anything now/iu,
  /kuralları\s*(yok say|atla|çiğne)/iu,
  /talimatları\s*(yok say|unut|atla)/iu,
  /gizli\s+(kurallar|prompt|talimat)/iu,
];

const SENSITIVE_DATA_PATTERNS = [
  /(?:^|[^\p{L}\p{N}_])(?:şifre\p{L}*|parola\p{L}*|password\p{L}*|token\p{L}*|secret\p{L}*|api\s*key\p{L}*|private\s*key\p{L}*|vapid\p{L}*)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:telefon numarası|e-?posta adresi|email adresi|kişisel veri|kimlik numarası)/iu,
  /(?:^|[^\p{L}\p{N}_])(?:audit\s+log\p{L}*|işlem\s+geçmişi\s+kayıtlarının\s+tamamı\p{L}*|ham\s+medya\p{L}*|base64\p{L}*)(?=$|[^\p{L}\p{N}_])/iu,
];

const UNSAFE_DIAGNOSIS_PATTERNS = [
  /kesin\s+(arıza|teşhis|neden)/iu,
  /arıza\s+(nedeni|teşhisi)\s+(nedir|ne|koy)/iu,
  /tamir\s+(et|talimatı|nasıl)/iu,
  /motor\s+(kesinlikle|mutlaka)\s+(bozuk|arızalı)/iu,
];

const QUESTION_HELP_PATTERNS = [
  /ne\s+yapabilirsin/iu,
  /\byardım\b/iu,
  /hangi\s+(sorular|sorgular)/iu,
  /nasıl\s+çalış/iu,
];

const EXTERNAL_SERVICE_PATTERNS = [
  /dış\s+hizmet/iu,
  /harici\s+servis/iu,
  /garanti/iu,
  /dış\s+servis/iu,
  /servisten\s+hizmet/iu,
  /servis\s+firması/iu,
  /servisi?\s+(?:hangi|kaç|nerede|tarafından)/iu,
];

const TECHNICIAN_PATTERNS = [
  /teknisyen/iu,
  /personel\s+performans/iu,
  /performans/iu,
  /çalışma\s+süresi/iu,
  /teknisyen\s+görevi/iu,
  /hangi\s+bakımlarda?\s+(çalış|görev)/iu,
  /hangi\s+motorlarda?\s+(çalış|görev)/iu,
  /hangi\s+(bakım|motor|iş).*?(çalış|görev)/iu,
  /(?:yardımcı|destek)\s+(?:olarak\s+)?çalış/iu,
  /['’](?:in|ın|ün|un|nin|nın|nün|nun)\s+.{0,80}\bbakım/iu,
  /en\s+(çok|fazla)\s+(çalış|görev)/iu,
  /kim\s+(en\s+çok\s+)?(çalıştı|çalışmış|görev\s+(aldı|yaptı))/iu,
  /\bne\s+kadar(?:\s+süre)?\s+(?:çalıştı|çalışmış|çalışmıştır)/iu,
  /\b(?:toplam|kaç)\s+saat\s+(?:çalıştı|çalışmış)/iu,
];

const FORECAST_PATTERNS = [
  /(?:gelecek|önümüzdeki|bir sonraki)\s+yıl.*(?:bakım|bakımları|bakımların)/iu,
  /(?:hangi|planlanan|tahmini|öngörülen).{0,100}\b bakım(?:lar|ları)?\b.{0,100}(?:gelecek|yapılacak|planlan|öngör)/iu,
  /\b(?:20\d{2}|21\d{2})\b['’]?(?:de|da|te|ta|yılında|yılına|için)?[^?]{0,100}(?:planlanan|tahmini|öngörülen|gelecek|yapılacak|planlan).{0,80}\bbakım/iu,
  /\bbakım(?:lar|ları)?\b[^?]{0,100}\b(?:20\d{2}|21\d{2})\b[^?]{0,100}(?:gelecek|yapılacak|planlan|tahmin)/iu,
  /bakım\s+tarihi\s+tahmini/iu,
];

const OVERDUE_PATTERNS = [
  /gecikmiş/iu,
  /geciken/iu,
  /gecikme/iu,
  /vadesi\s+geç/iu,
  /acil\s+bakım/iu,
  /kritik\s+(?:bakım|motor)/iu,
  /yaklaşan\s+(?:bakım|bakımlar)/iu,
  /normal\s+(?:bakım|durum)/iu,
];

const ENGINE_HISTORY_PATTERNS = [
  /son\s+bakım/iu,
  /bakım\s+geçmiş/iu,
  /motor\s+\S+/iu,
];

const RECORD_FILTER_PATTERNS = [
  /geriye\s+dönük|sonradan\s+girilen|backdated/iu,
  /başlangıç.*(?:eksik|yok)|bitiş.*(?:eksik|yok)|zaman\s+bilgisi.*(?:eksik|yok)|saat\s+bilgisi.*(?:eksik|yok)/iu,
  /(?:teyit|teyidi)\s*(?:edilmemiş|bekleyen|yok|olmayan)|onaylanmamış|doğrulanmamış/iu,
];

const ENGINE_DATA_PATTERNS = [
  /çalışma\s+saat(?:i|leri)?/iu,
  /motor\s+saat(?:i|leri)?/iu,
  /kaç\s+saat\s+(?:çalış|çalışıyor|çalışmış)/iu,
  /yük(?:ü|\s+bilgisi|\s+değeri)/iu,
  /motor\s+(?:durumu|bilgileri)/iu,
  /motor(?:lar|ların)?\s+(?:çalışma\s+)?saat(?:i|leri)?/iu,
];

const MAINTENANCE_CATALOG_PATTERNS = [
  /bakım\s+tür(?:ü|leri)(?:nin)?\s+(?:listesi|neler|hangileri|sayısı|tanımlı|var|mevcut|periyot|listele|göster|getir)/iu,
  /tanımlı\s+bakım/iu,
  /hangi\s+bakımlar?\s+(?:tanımlı|var|mevcut)/iu,
  /bakım\s+periyod(?:u|ları)/iu,
  /periyot(?:u|ları)?\s+(?:kaç|nedir|ne|hangi)/iu,
];

const PRESSURE_PATTERNS = [
  /karter/iu,
  /basınç\s+(?:okuma(?:sı|ları|larını)?|ölç(?:ümü|ümleri|ümlerini)?|değer(?:i|leri|lerini)?|durum(?:u|ları)?)/iu,
  /basınç\s+(?:kaç|nedir|listele|göster|getir)/iu,
];

const OIL_ANALYSIS_PATTERNS = [
  /yağ\s+analiz/iu,
  /yağ\s+(?:sonucu|raporu|değeri)/iu,
];

const EQUIPMENT_INFO_PATTERNS = [
  /motor\s+teknik\s+(?:özellik|bilgi|kart)/iu,
  /motor\s+(?:özellik|kart)\b/iu,
  /(?:kaver|hava\s+filtresi|krankcase|eşanjör|dungs|radyatör)/iu,
];

const TECHNICIAN_DIRECTORY_PATTERNS = [
  /aktif\s+teknisyen/iu,
  /teknisyenler?\s+(?:kimler|listesi|kaç|hangi|hangileri|listele|göster|getir)/iu,
  /mekanik\s+ve\s+elektromekanik\s+teknisyen/iu,
];

const MAINTENANCE_HEALTH_PATTERNS = [
  /bakım\s+(?:sağlığı|durumu|takibi)/iu,
  /kalan\s+saat(?:i|leri)?/iu,
  /kritik\s+bakım(?:lar|ları)?/iu,
  /hangi\s+bakım(?:lar|ları)?\s+kritik/iu,
  /hangi\s+motor(?:lar|ların)?\s+(?:kritik|gecikmiş|yaklaşıyor|normal)/iu,
  /motor(?:lar|ların)?\s+hangi\s+bakım(?:larda|ları)?\s+(?:kritik|gecikmiş|yaklaşıyor|normal)/iu,
];

const NOTIFICATION_PATTERNS = [
  /bildirim/iu,
  /okunmamış\s+(?:uyarı|bildirim)/iu,
  /kaç\s+(?:uyarı|bildirim)/iu,
];

const SUMMARY_PATTERNS = [
  /özet/iu,
  /kaç\s+bakım/iu,
  /toplam\s+bakım/iu,
  /istatistik/iu,
  /en\s+fazla/iu,
  /bakım\s+sayısı/iu,
  /hangi\s+bakımlar?/iu,
  /bakımlar?\s+(?:hangileri|nelerdir)/iu,
  /en\s+(?:uzun|kısa)\s+süren/iu,
  /hangi\s+bakımlar?\s+(yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
  /bakımlar?\s+(yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
  /hangi\s+motorlarda?\s+(?:bakım|çalışma|iş)/iu,
  /hangi\s+motorlarda?\s+.{2,80}\s+bakım/iu,
  /(?:yapılan|yapılmış)\s+motorlar?/iu,
  /bakım\s+türü\s*[:=-]/iu,
];

const INTERNAL_SOURCE_PATTERNS = [
  /iç\s+(ekip|kaynak|bakım)/iu,
  /kayıtlı\s+teknisyen/iu,
  /dış\s+hizmet\s+(olmayan|hariç)/iu,
];

function parseNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function parseRange(question: string, unitPattern: string): { min?: number; max?: number } | undefined {
  const range = question.match(new RegExp(`(\\d[\\d.,]*)\\s*${unitPattern}?\\s*(?:ile|-|–)\\s*(\\d[\\d.,]*)\\s*${unitPattern}`, "iu"));
  if (range) {
    const first = parseNumber(range[1]);
    const second = parseNumber(range[2]);
    if (Number.isFinite(first) && Number.isFinite(second)) return first <= second ? { min: first, max: second } : { min: second, max: first };
  }
  const above = question.match(new RegExp(`(\\d[\\d.,]*)\\s*${unitPattern}?(?:den|dan|ten|tan)\\s+(?:fazla|uzun|üzeri)`, "iu"));
  if (above) {
    const min = parseNumber(above[1]);
    if (Number.isFinite(min)) return { min };
  }
  const below = question.match(new RegExp(`(\\d[\\d.,]*)\\s*${unitPattern}?(?:den|dan|ten|tan)\\s+(?:az|kısa|altı)`, "iu"));
  if (below) {
    const max = parseNumber(below[1]);
    if (Number.isFinite(max)) return { max };
  }
  return undefined;
}

function extractMaintenanceTypeQuery(question: string): string | undefined {
  const explicit = question.match(/bakım\s+türü\s*[:=-]\s*(.+?)(?=\s+(?:\d{4}|dış\s+hizmet|iç\s+ekip|fotoğraflı|videolu|not\s+içeren|ekip|hangi\s+motorlarda|motorlarda|hangi\s+bakımlarda)|\?|$)/iu);
  if (explicit?.[1]?.trim()) return explicit[1].trim();
  const natural = question.match(/^(.{2,80}?)\s+bakım(?:ı|ını|ları|larını)?\s+(?:hangi\s+motorlarda|nerede|kaç)/iu)
    || question.match(/(?:hangi\s+motorlarda|motorlarda)\s+(.{2,80}?)\s+bakım(?:ı|ını|ları|larını)?\s+(?:yapıldı|yapılmış|gerçekleşti|var)/iu)
    || question.match(/^(.{2,80}?)\s+bakım(?:ı|ını|ları|larını)?\s+yap(?:ıldı|ılan)\s+motorlar?/iu);
  return natural?.[1]?.trim();
}

function extractServiceQuery(question: string): string | undefined {
  const explicit = question.match(/(?:servis|firma)\s*(?:adı)?\s*[:=-]\s*([^;,?]+)/iu);
  if (explicit?.[1]?.trim()) return explicit[1].trim();
  const namedService = question.match(/\b([a-zçğıöşü0-9][a-zçğıöşü0-9 ._-]{1,60}?)\s+servisi?\b/iu);
  if (namedService && !/^(dış|harici)$/iu.test(namedService[1].trim())) return namedService[1].trim();
  return undefined;
}

function parseFilters(question: string): Pick<AssistantQuery, "maintenanceTypeQuery" | "maintenancePeriodHours" | "serviceQuery" | "technicianRole" | "sourceFilter" | "evidenceFilter" | "statusFilter" | "recordFilters" | "hourRange" | "durationRange" | "teamOnly" | "unreadOnly"> {
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
  const maintenancePeriodHours = extractMaintenancePeriodHours(question);
  return { maintenanceTypeQuery: maintenancePeriodHours ? undefined : extractMaintenanceTypeQuery(question), maintenancePeriodHours, serviceQuery: extractServiceQuery(question), technicianRole, sourceFilter, evidenceFilter, statusFilter, recordFilters: recordFilters.length ? recordFilters : undefined, hourRange, durationRange, teamOnly, unreadOnly };
}

function cleanQuestion(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

const TURKISH_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6,
  temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12,
};
const TURKISH_MONTH_PATTERN = Object.keys(TURKISH_MONTHS).join("|");

function dateKey(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftDateKey(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) || value;
}

function currentTurkeyDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return dateKey(Number(values.year), Number(values.month), Number(values.day)) || new Date().toISOString().slice(0, 10);
}

function dateRange(from: string, to = from): AssistantDateRange {
  return from <= to ? { from, to } : { from: to, to: from };
}

function parseDateRange(question: string): AssistantDateRange | undefined {
  const currentYear = Number(currentTurkeyDateKey().slice(0, 4));
  const numericDates: string[] = [];
  for (const match of question.matchAll(/(?<!\d)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/g)) {
    const parsed = dateKey(Number(match[1]), Number(match[2]), Number(match[3]));
    if (parsed) numericDates.push(parsed);
  }
  for (const match of question.matchAll(/(?<![\d-])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/g)) {
    const parsed = dateKey(Number(match[3]), Number(match[2]), Number(match[1]));
    if (parsed) numericDates.push(parsed);
  }
  if (numericDates.length >= 2) return dateRange(numericDates[0], numericDates[1]);
  if (numericDates.length === 1) return dateRange(numericDates[0]);

  const sameMonthRange = question.match(new RegExp(`(?<!\\d)(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+(${TURKISH_MONTH_PATTERN})(?:['’][a-zçğıöşü]+)?(?:\\s+(\\d{4}))?`, "iu"));
  if (sameMonthRange) {
    const month = TURKISH_MONTHS[sameMonthRange[3].toLocaleLowerCase("tr-TR")];
    const year = Number(sameMonthRange[4] || currentYear);
    const from = dateKey(year, month, Number(sameMonthRange[1]));
    const to = dateKey(year, month, Number(sameMonthRange[2]));
    if (from && to) return dateRange(from, to);
  }

  const dayMonthDates: string[] = [];
  for (const match of question.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${TURKISH_MONTH_PATTERN})(?:['’][a-zçğıöşü]+)?(?:\\s+(\\d{4}))?`, "giu"))) {
    const month = TURKISH_MONTHS[match[2].toLocaleLowerCase("tr-TR")];
    const parsed = dateKey(Number(match[3] || currentYear), month, Number(match[1]));
    if (parsed) dayMonthDates.push(parsed);
  }
  if (dayMonthDates.length >= 2) return dateRange(dayMonthDates[0], dayMonthDates[1]);
  if (dayMonthDates.length === 1) return dateRange(dayMonthDates[0]);

  const monthYear = question.match(new RegExp(`(${TURKISH_MONTH_PATTERN})(?:['’]?[a-zçğıöşü]+)?\\s+(\\d{4})`, "iu"))
    || question.match(new RegExp(`(\\d{4})\\s+(${TURKISH_MONTH_PATTERN})`, "iu"));
  if (monthYear) {
    const monthName = monthYear[1].match(/^\\d/) ? monthYear[2] : monthYear[1];
    const year = Number(monthYear[1].match(/^\\d/) ? monthYear[1] : monthYear[2]);
    const month = TURKISH_MONTHS[monthName.toLocaleLowerCase("tr-TR")];
    const from = dateKey(year, month, 1);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const to = dateKey(year, month, lastDay);
    if (from && to) return dateRange(from, to);
  }

  const today = currentTurkeyDateKey();
  const recentRange = question.match(/\bson\s+(bir|\d+)\s+(gün|hafta)\b/iu);
  if (recentRange) {
    const quantity = recentRange[1].toLocaleLowerCase("tr-TR") === "bir" ? 1 : Number(recentRange[1]);
    const unit = recentRange[2].toLocaleLowerCase("tr-TR");
    if (Number.isInteger(quantity) && quantity > 0 && quantity <= 52) {
      const days = unit === "hafta" ? quantity * 7 : quantity;
      return dateRange(shiftDateKey(today, -(days - 1)), today);
    }
  }
  if (/geçen\s+hafta/iu.test(question) || /bu\s+hafta/iu.test(question)) {
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const monday = shiftDateKey(today, -(weekday + 6) % 7);
    return /geçen\s+hafta/iu.test(question) ? dateRange(shiftDateKey(monday, -7), shiftDateKey(monday, -1)) : dateRange(monday, shiftDateKey(monday, 6));
  }
  if (/geçen\s+ay/iu.test(question)) {
    const firstThisMonth = `${today.slice(0, 8)}01`;
    const lastPreviousMonth = shiftDateKey(firstThisMonth, -1);
    const from = `${lastPreviousMonth.slice(0, 8)}01`;
    return dateRange(from, lastPreviousMonth);
  }
  return undefined;
}

function periodFromQuestion(question: string): AssistantPeriod {
  if (/bu\s+ay/iu.test(question)) return "month";
  if (/(son\s+(3|üç)\s+ay|son\s+çeyrek)/iu.test(question)) return "3months";
  if (/bu\s+yıl|bu\s+sene/iu.test(question)) return "year";
  return "all";
}

function extractMaintenancePeriodHours(question: string): number | undefined {
  const match = question.match(/(?<![\d.,])(\d[\d.,]*)\s*(?:saat(?:lik)?\s*)?bakım(?:ı|ını|ları|larını)?\b/iu);
  if (!match) return undefined;
  const value = parseNumber(match[1]);
  return Number.isInteger(value) && value >= 100 && value <= 100000 ? value : undefined;
}

function extractTargetYear(question: string): number | undefined {
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

function extractEngineQuery(question: string): string | undefined {
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

function inferIntent(question: string): AssistantIntent {
  if (QUESTION_HELP_PATTERNS.some((pattern) => pattern.test(question))) return "help";
  if (FORECAST_PATTERNS.some((pattern) => pattern.test(question))) return "maintenance_forecast";
  if (MAINTENANCE_CATALOG_PATTERNS.some((pattern) => pattern.test(question))) return "maintenance_catalog";
  if (OIL_ANALYSIS_PATTERNS.some((pattern) => pattern.test(question))) return "oil_analysis";
  if (PRESSURE_PATTERNS.some((pattern) => pattern.test(question))) return "pressure_readings";
  if (EQUIPMENT_INFO_PATTERNS.some((pattern) => pattern.test(question))) return "equipment_info";
  if (TECHNICIAN_DIRECTORY_PATTERNS.some((pattern) => pattern.test(question))) return "technician_directory";
  if (NOTIFICATION_PATTERNS.some((pattern) => pattern.test(question))) return "notification_summary";
  if (MAINTENANCE_HEALTH_PATTERNS.some((pattern) => pattern.test(question))) return "maintenance_health";
  const engineQuery = extractEngineQuery(question);
  if (extractMaintenancePeriodHours(question)) return "maintenance_forecast";
  if (ENGINE_DATA_PATTERNS.some((pattern) => pattern.test(question)) && (Boolean(engineQuery) || /\bmotor(?:lar|ların)?\b/iu.test(question))) return "engine_data";
  if (engineQuery && ENGINE_HISTORY_PATTERNS.slice(0, 2).some((pattern) => pattern.test(question))) return "engine_history";
  if (!INTERNAL_SOURCE_PATTERNS.some((pattern) => pattern.test(question)) && EXTERNAL_SERVICE_PATTERNS.some((pattern) => pattern.test(question))) return "external_service";
  if (/(?:\bekip\b|birlikte\s+çalış|birden\s+fazla\s+teknisyen|diğer\s+teknisyen)/iu.test(question) && /bakım/iu.test(question)) return "summary";
  if (TECHNICIAN_PATTERNS.some((pattern) => pattern.test(question))) return "technician_performance";
  const hasCombinedRecordFilter = RECORD_FILTER_PATTERNS.some((pattern) => pattern.test(question))
    || INTERNAL_SOURCE_PATTERNS.some((pattern) => pattern.test(question))
    || /fotoğraf|fotoğraflı|video|videolu|not\s+içeren|kontrol\s+listesi|\bekip\b/iu.test(question);
  if (hasCombinedRecordFilter) return "summary";
  if (OVERDUE_PATTERNS.some((pattern) => pattern.test(question))) return "overdue";
  if (engineQuery && ENGINE_HISTORY_PATTERNS.some((pattern) => pattern.test(question))) return "engine_history";
  if (SUMMARY_PATTERNS.some((pattern) => pattern.test(question))) return "summary";
  return "help";
}

export function evaluateAssistantQuestion(value: unknown): AssistantPolicyResult {
  const parsed = assistantRequestSchema.safeParse({ question: value });
  if (!parsed.success) {
    return {
      ok: false,
      question: typeof value === "string" ? value.slice(0, MAX_ASSISTANT_QUESTION_LENGTH) : "",
      code: "invalid_input",
      message: parsed.error.issues[0]?.message || "Geçerli bir soru yazın.",
    };
  }

  const question = cleanQuestion(parsed.data.question);
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      ok: false,
      question,
      code: "prompt_injection",
      message: "Bu asistan yalnızca AGM Bakım raporlarını okumak için sınırlandırılmıştır.",
    };
  }
  if (WRITE_REQUEST_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      ok: false,
      question,
      code: "write_request",
      message: "Salt okunur asistan kayıt oluşturamaz, düzenleyemez, silemez veya teknisyen atayamaz. Yalnızca rapor ve bakım bilgilerini görüntüleyebilirim.",
    };
  }
  if (SENSITIVE_DATA_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      ok: false,
      question,
      code: "sensitive_data",
      message: "Şifre, token, kişisel iletişim bilgisi, ham medya veya gizli sistem verilerini görüntüleyemem.",
    };
  }
  if (UNSAFE_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      ok: false,
      question,
      code: "unsafe_diagnosis",
      message: "Kesin arıza teşhisi veya tamir talimatı veremem. Yalnızca ölçüm ve bakım kayıtlarında incelenmesi gereken noktaları gösterebilirim.",
    };
  }

  const intent = inferIntent(question);
  return {
    ok: true,
    question,
    query: {
      question,
      intent,
      period: periodFromQuestion(question),
      targetYear: extractTargetYear(question),
      maintenancePeriodHours: extractMaintenancePeriodHours(question),
      engineQuery: extractEngineQuery(question),
      dateRange: parseDateRange(question),
      ...parseFilters(question),
    },
  };
}

export function isAllowedAssistantTool(tool: string): tool is AllowedAssistantTool {
  return [
    "getMaintenanceSummary",
    "getOverdueMaintenance",
    "getEngineMaintenanceHistory",
    "getTechnicianPerformance",
    "getExternalServiceSummary",
    "getMaintenanceForecast",
    "getEngineData",
    "getMaintenanceCatalog",
    "getPressureReadings",
    "getOilAnalysis",
    "getEquipmentInfo",
    "getTechnicianDirectory",
    "getNotificationSummary",
    "getMaintenanceHealth",
  ].includes(tool);
}

export function redactedRecordProjection(): Record<string, 0 | 1> {
  return {
    _id: 1,
    engine_id: 1,
    engine_name: 1,
    type_key: 1,
    type_label: 1,
    hour_at_completion: 1,
    technician_id: 1,
    technician_name: 1,
    technician_source: 1,
    external_service_name: 1,
    other_technicians: 1,
    maintenance_start_at: 1,
    maintenance_end_at: 1,
        maintenance_duration_minutes: 1,
        created_at: 1,
  };
}

export function assistantSystemBoundary(): string {
  return [
    `Policy ${ASSISTANT_POLICY_VERSION}: You are a read-only maintenance reporting assistant.`,
    "Never create, update, delete, assign, approve, notify, or restore data.",
    "Only answer from tool results; never invent records, names, dates, durations, or diagnoses.",
    "For forecast results, distinguish overdue backlog from estimated future dates and state the 24-hour-per-day assumption.",
    "Do not reveal secrets, credentials, raw media, base64, or unnecessary personal data.",
    "For oil/pressure or machine health questions, describe observations and recommend human review; do not give definitive diagnosis or repair instructions.",
  ].join(" ");
}
