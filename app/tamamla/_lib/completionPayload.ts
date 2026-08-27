import type { MaintenanceType, ReportAttachment, VideoRef } from "@/lib/types";
import { normalizeTechnicianContributionDuration } from "@/lib/maintenanceTime";

export interface CompletionPayloadInput {
  clientRequestId: string;
  engineId: string;
  chosenType: MaintenanceType;
  technicianSource: "internal" | "external_service";
  isManagerInternalRecord: boolean;
  responsibleTechnicianId: string;
  responsibleDurationMinutes: number | null;
  externalServiceName: string;
  hours: number;
  techNote: string;
  maintenanceStartAt: string;
  maintenanceEndAt: string;
  photos: string[];
  videos: VideoRef[];
  reportAttachments: ReportAttachment[];
  pressure: string;
  isBackdated: boolean;
  isPrimaryNew: boolean;
  primaryPeriod: number;
  types: MaintenanceType[];
  extraKeys: string[];
  extraPeriods: Record<string, number>;
  trackedKeys: ReadonlySet<string>;
  selectedSupportIds: string[];
  otherTechnicianDurations: Record<string, string | number>;
  maintenanceDurationMinutes: number | null;
  checklistItems: string[];
  checklist: Record<string, boolean>;
}

export interface CompletionPayload extends Record<string, unknown> {
  client_request_id: string;
  engine_id: string;
  type_key: string;
  type_label: string;
  technician_source: "internal" | "external_service";
  responsible_technician_id?: string;
  responsible_technician_duration?: number;
  external_service_name?: string;
  hour_at_completion: number;
  technician_note: string;
  time_tracking_version: 2;
  maintenance_start_at: string;
  maintenance_end_at: string;
  photos: string[];
  videos: VideoRef[];
  report_attachments: ReportAttachment[];
  pressure_reading?: number;
  backdated: boolean;
  period?: number;
  extra_types: Array<{ type_key: string; type_label: string; period?: number }>;
  other_technician_ids: string[];
  other_technician_durations: Record<string, number>;
  checklist: Array<{ label: string; completed: boolean }>;
  completion_confirmation: true;
}

export function buildCompletionPayload(input: CompletionPayloadInput): CompletionPayload {
  const extra_types = input.extraKeys.flatMap((key) => {
    const type = input.types.find((candidate) => candidate.key === key);
    if (!type) return [];
    return [{
      type_key: key,
      type_label: type.label,
      period: input.trackedKeys.has(key) ? undefined : Number(input.extraPeriods[key]),
    }];
  });

  return {
    client_request_id: input.clientRequestId,
    engine_id: input.engineId,
    type_key: input.chosenType.key,
    type_label: input.chosenType.label,
    technician_source: input.technicianSource,
    ...(input.isManagerInternalRecord && input.responsibleTechnicianId ? { responsible_technician_id: input.responsibleTechnicianId } : {}),
    ...(input.isManagerInternalRecord && input.responsibleDurationMinutes !== null ? { responsible_technician_duration: input.responsibleDurationMinutes } : {}),
    external_service_name: input.technicianSource === "external_service" ? input.externalServiceName.trim() || undefined : undefined,
    hour_at_completion: Number(input.hours),
    technician_note: input.techNote,
    time_tracking_version: 2,
    maintenance_start_at: new Date(input.maintenanceStartAt).toISOString(),
    maintenance_end_at: new Date(input.maintenanceEndAt).toISOString(),
    photos: input.photos,
    videos: input.videos,
    report_attachments: input.reportAttachments,
    pressure_reading: input.pressure !== "" ? Number(input.pressure) : undefined,
    backdated: input.isBackdated,
    period: input.isPrimaryNew ? Number(input.primaryPeriod) : undefined,
    extra_types,
    other_technician_ids: input.selectedSupportIds,
    other_technician_durations: Object.fromEntries(
      input.selectedSupportIds.map((id) => [id, normalizeTechnicianContributionDuration(input.otherTechnicianDurations[id], input.maintenanceDurationMinutes ?? 60)]),
    ),
    checklist: input.checklistItems.map((label) => ({ label, completed: input.checklist[label] === true })),
    completion_confirmation: true,
  };
}
