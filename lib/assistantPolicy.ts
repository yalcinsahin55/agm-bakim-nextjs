import { z } from "zod";

export const ASSISTANT_POLICY_VERSION = "1.0" as const;
export const MAX_ASSISTANT_QUESTION_LENGTH = 300;
export const ASSISTANT_RATE_LIMIT = 20;
export const ASSISTANT_RATE_WINDOW_MS = 10 * 60 * 1000;

export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1, "Soru boş olamaz.").max(MAX_ASSISTANT_QUESTION_LENGTH, `Soru en fazla ${MAX_ASSISTANT_QUESTION_LENGTH} karakter olabilir.`),
});

export type AssistantPeriod = "month" | "3months" | "year" | "all";
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
  /hangi\s+bakımlar/iu,
];

const SUMMARY_PATTERNS = [
  /özet/iu,
  /kaç\s+bakım/iu,
  /toplam\s+bakım/iu,
  /istatistik/iu,
  /en\s+fazla/iu,
  /bakım\s+sayısı/iu,
];

function cleanQuestion(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
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
