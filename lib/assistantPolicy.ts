import { z } from "zod";

export const ASSISTANT_POLICY_VERSION = "1.1" as const;
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

export type AssistantIntent =
  | "summary"
  | "overdue"
  | "engine_history"
  | "technician_performance"
  | "external_service"
  | "help";

export type AllowedAssistantTool =
  | "getMaintenanceSummary"
  | "getOverdueMaintenance"
  | "getEngineMaintenanceHistory"
  | "getTechnicianPerformance"
  | "getExternalServiceSummary";

export interface AssistantQuery {
  question: string;
  intent: AssistantIntent;
  period: AssistantPeriod;
  engineQuery?: string;
  dateRange?: AssistantDateRange;
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
  /\b(şifre|parola|password|token|secret|api\s*key|private\s*key|vapid)\b/iu,
  /\b(telefon numarası|e-?posta adresi|email adresi|kişisel veri|kimlik numarası)\b/iu,
  /\b(audit log|işlem geçmişi kayıtlarının tamamı|ham medya|base64)\b/iu,
];

const UNSAFE_DIAGNOSIS_PATTERNS = [
  /kesin\s+(arıza|teşhis|neden)/iu,
  /arıza\s+(nedeni|teşhisi)\s+(nedir|ne|koy)/iu,
  /tamir\s+(et|talimatı|nasıl)/iu,
  /motor\s+(kesinlikle|mutlaka)\s+(bozuk|arızalı)/iu,
];

const QUESTION_HELP_PATTERNS = [
  /ne\s+yapabilirsin/iu,
  /yardım/iu,
  /hangi\s+(sorular|sorgular)/iu,
  /nasıl\s+çalış/iu,
];

const EXTERNAL_SERVICE_PATTERNS = [
  /dış\s+hizmet/iu,
  /harici\s+servis/iu,
  /garanti/iu,
  /dış\s+servis/iu,
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
  /en\s+(çok|fazla)\s+(çalış|görev)/iu,
  /kim\s+(en\s+çok\s+)?(çalıştı|çalışmış|görev\s+(aldı|yaptı))/iu,
];

const OVERDUE_PATTERNS = [
  /gecikmiş/iu,
  /geciken/iu,
  /gecikme/iu,
  /vadesi\s+geç/iu,
  /acil\s+bakım/iu,
];

const ENGINE_HISTORY_PATTERNS = [
  /son\s+bakım/iu,
  /bakım\s+geçmiş/iu,
  /motor\s+\S+/iu,
];

const SUMMARY_PATTERNS = [
  /özet/iu,
  /kaç\s+bakım/iu,
  /toplam\s+bakım/iu,
  /istatistik/iu,
  /en\s+fazla/iu,
  /bakım\s+sayısı/iu,
  /hangi\s+bakımlar?\s+(yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
  /bakımlar?\s+(yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
];

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

function extractEngineQuery(question: string): string | undefined {
  const match = question.match(/\bmotor\s*(?:no|numarası|#)?\s*([a-z0-9][a-z0-9._-]*)/iu);
  if (!match) return undefined;
  const candidate = match[1].trim();
  if (/^(bakım|bakımları|geçmişi|durumu|sayısı|istatistiği|raporu|için|hangileri|var|larda|larda)$/iu.test(candidate)) return undefined;
  return candidate;
}

function inferIntent(question: string): AssistantIntent {
  if (QUESTION_HELP_PATTERNS.some((pattern) => pattern.test(question))) return "help";
  if (EXTERNAL_SERVICE_PATTERNS.some((pattern) => pattern.test(question))) return "external_service";
  if (TECHNICIAN_PATTERNS.some((pattern) => pattern.test(question))) return "technician_performance";
  if (OVERDUE_PATTERNS.some((pattern) => pattern.test(question))) return "overdue";
  if (ENGINE_HISTORY_PATTERNS.some((pattern) => pattern.test(question))) return "engine_history";
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
      engineQuery: extractEngineQuery(question),
      dateRange: parseDateRange(question),
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
    "Do not reveal secrets, credentials, raw media, base64, or unnecessary personal data.",
    "For oil/pressure or machine health questions, describe observations and recommend human review; do not give definitive diagnosis or repair instructions.",
  ].join(" ");
}
