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
  enginePerformance?: boolean;
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
  /** “Tümünü/hepsini göster” gibi ifadelerde güvenli üst sınır dahilinde tüm sonuçları döndürür. */
  showAll?: boolean;
  /** Export sırasında seçilen bakım türlerini sonuç kümesinden dışlamak için kullanılır. */
  excludedTypeLabels?: string[];
}

export interface AssistantPolicyResult {
  ok: boolean;
  question: string;
  query?: AssistantQuery;
  code?: "invalid_input" | "write_request" | "prompt_injection" | "sensitive_data" | "unsafe_diagnosis";
  message?: string;
}
