import { z } from "zod";
import {
  MOTOR_PERFORMANCE_PATTERNS,
  PROMPT_INJECTION_PATTERNS,
  SENSITIVE_DATA_PATTERNS,
  UNSAFE_DIAGNOSIS_PATTERNS,
  WRITE_REQUEST_PATTERNS,
} from "./assistantPolicyPatterns.ts";
import { parseDateRange } from "./assistantPolicyDateRanges.ts";
import { extractMaintenancePeriodHours } from "./assistantPolicyNumbers.ts";
import { parseFilters } from "./assistantPolicyFilters.ts";
import { extractEngineQuery, extractTargetYear, inferIntent, periodFromQuestion } from "./assistantPolicyIntent.ts";
import type { AllowedAssistantTool, AssistantPolicyResult } from "./assistantPolicyTypes.ts";

export type {
  AllowedAssistantTool,
  AssistantDateRange,
  AssistantEvidenceFilter,
  AssistantIntent,
  AssistantPeriod,
  AssistantPolicyResult,
  AssistantQuery,
  AssistantRecordFilter,
  AssistantSourceFilter,
  AssistantStatusFilter,
  AssistantTechnicianRole,
} from "./assistantPolicyTypes.ts";

export const ASSISTANT_POLICY_VERSION = "1.4" as const;
export const MAX_ASSISTANT_QUESTION_LENGTH = 300;
export const ASSISTANT_RATE_LIMIT = 20;
export const ASSISTANT_RATE_WINDOW_MS = 10 * 60 * 1000;

export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1, "Soru boş olamaz.").max(MAX_ASSISTANT_QUESTION_LENGTH, `Soru en fazla ${MAX_ASSISTANT_QUESTION_LENGTH} karakter olabilir.`),
});

function cleanQuestion(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
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
      enginePerformance: MOTOR_PERFORMANCE_PATTERNS.some((pattern) => pattern.test(question)),
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
    "Do not reveal secrets, credentials, raw media, base64, public Blob URLs, or unnecessary personal data; report files may be referenced only through authenticated same-origin links.",
    "For oil/pressure or machine health questions, describe observations and recommend human review; do not give definitive diagnosis or repair instructions.",
  ].join(" ");
}
