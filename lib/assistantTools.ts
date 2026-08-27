import type { Db } from "mongodb";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import type { AssistantToolResponse } from "./assistant/types";
export type { AssistantToolResponse } from "./assistant/types";
import { getMaintenanceSummary, getOverdueMaintenance, getMaintenanceForecast, getEngineMaintenanceHistory, getMaintenanceHealth } from "./assistant/maintenanceTools";
import { getTechnicianPerformance, getExternalServiceSummary, getTechnicianDirectory } from "./assistant/technicianTools";
import { getEngineData, getMaintenanceCatalog, getEquipmentInfo } from "./assistant/engineTools";
import { getPressureReadings, getOilAnalysis } from "./assistant/analysisTools";
import { getNotificationSummary } from "./assistant/notificationTools";

export async function runAssistantTool(db: Db, query: AssistantQuery, context: { userId?: string } = {}): Promise<AssistantToolResponse> {
  if (query.intent === "summary") return getMaintenanceSummary(db, query);
  if (query.intent === "overdue") return getOverdueMaintenance(db, query);
  if (query.intent === "engine_history") return getEngineMaintenanceHistory(db, query);
  if (query.intent === "technician_performance") return getTechnicianPerformance(db, query);
  if (query.intent === "external_service") return getExternalServiceSummary(db, query);
  if (query.intent === "maintenance_forecast") return getMaintenanceForecast(db, query);
  if (query.intent === "engine_data") return getEngineData(db, query);
  if (query.intent === "maintenance_catalog") return getMaintenanceCatalog(db, query);
  if (query.intent === "pressure_readings") return getPressureReadings(db, query);
  if (query.intent === "oil_analysis") return getOilAnalysis(db, query);
  if (query.intent === "equipment_info") return getEquipmentInfo(db, query);
  if (query.intent === "technician_directory") return getTechnicianDirectory(db, query);
  if (query.intent === "notification_summary") return getNotificationSummary(db, query, context.userId);
  if (query.intent === "maintenance_health") return getMaintenanceHealth(db, query);
  return {
    intent: "help",
    period: query.period,
    title: "Bakım Asistanı",
    summary: "Bakım kayıtları, motor çalışma verileri, planlar ve güvenli rapor alanları hakkında salt okunur bilgi verebilirim.",
    data: {
      examples: [
        "Bu ay kaç bakım yapıldı?",
        "AGM 7 çalışma saatleri ve yükü nedir?",
        "Bakım türleri ve periyotları neler?",
        "AGM 7 karter basıncı son ölçümleri neler?",
        "Son yağ analizlerini göster.",
        "Motor teknik bilgi kartları neler?",
        "Aktif teknisyenler kimler?",
        "Yalçın Şahin bu hafta ne kadar çalıştı?",
        "Yalçın Şahin hangi bakımlarda çalıştı?",
        "Okunmamış bildirimlerim hangileri?",
        "Motor bakım sağlığı ve kalan saatler nasıl?",
        "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
      ],
    },
  };
}
