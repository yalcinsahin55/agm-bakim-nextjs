import { EXTERNAL_SERVICE_TECHNICIAN_ID, EXTERNAL_SERVICE_TECHNICIAN_NAME, TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import { getMaintenanceRecordDate } from "@/lib/maintenanceTime";
import type { MaintenanceRecord } from "../_types";

export function technicianLabel(record: MaintenanceRecord): string {
  const name = record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID
    ? record.technician_name || EXTERNAL_SERVICE_TECHNICIAN_NAME
    : record.technician_name || "—";
  if (record.technician_source === "external_service" || !record.technician_type) return name;
  return `${name} · ${TECHNICIAN_TYPE_LABELS[record.technician_type] || "Mekanik teknisyen"}`;
}

export interface ConfirmationContributionRow {
  id: string;
  full_name: string;
  technician_type?: "mekanik" | "elektromekanik";
  contribution_role: "responsible" | "support";
  duration_minutes?: number;
}

export function confirmationContributionRows(record: MaintenanceRecord): ConfirmationContributionRow[] {
  if (record.technician_contributions?.length) return record.technician_contributions;
  if (record.technician_source === "external_service") return [];
  const fallbackDuration = typeof record.maintenance_duration_minutes === "number" ? record.maintenance_duration_minutes : undefined;
  const rows: ConfirmationContributionRow[] = [{
    id: record.technician_id,
    full_name: record.technician_name || "Sorumlu teknisyen",
    technician_type: record.technician_type,
    contribution_role: "responsible",
    duration_minutes: fallbackDuration,
  }];
  for (const technician of record.other_technicians || []) {
    if (!technician?.id || !technician.full_name) continue;
    rows.push({ ...technician, contribution_role: "support" });
  }
  return rows;
}

export function minutesToHoursInput(minutes: number | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "";
  return String(Number((minutes / 60).toFixed(2)));
}

export function hoursInputToMinutes(value: string): number | null {
  const hours = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const minutes = Math.round(hours * 60);
  return minutes > 0 && minutes <= 366 * 24 * 60 ? minutes : null;
}

export function maintenanceDayKey(record: MaintenanceRecord): string {
  const date = getMaintenanceRecordDate(record.maintenance_start_at, record.created_at);
  if (!date || !Number.isFinite(date.getTime())) return "unknown";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function reportAttachmentUrl(recordId: string, attachmentId: string, download = false): string {
  const base = `/api/records/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(attachmentId)}`;
  return download ? `${base}?download=1` : base;
}

export function maintenanceDayLabel(key: string): string {
  if (key === "unknown") return "Tarihi bilinmeyen kayıtlar";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const difference = Math.round((startOfToday - date.getTime()) / 86_400_000);
  if (difference === 0) return "Bugün";
  if (difference === 1) return "Dün";
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}
