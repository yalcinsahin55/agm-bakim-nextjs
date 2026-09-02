import type { ClientSession, Db } from "mongodb";
import { recomputeLastMaintenance } from "@/lib/maintenance";
import { recordsCollection } from "@/lib/dbCollections";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import type { MaintenanceTechnicianContribution, User } from "@/lib/types";

type RecordsCollection = ReturnType<typeof recordsCollection>;

type ChecklistItem = { label: string; completed: boolean };

export async function insertCreatedMaintenanceRecord(params: {
  db: Db;
  recordsCol: RecordsCollection;
  engineId: string;
  engineName: string;
  hourAtCompletion: number;
  maintenanceStartAt?: Date;
  maintenanceEndAt?: Date;
  maintenanceDurationMinutes: number | null;
  note?: string;
  technicianNote?: string;
  photosB64?: string[];
  photos?: string[];
  videos?: MaintenanceRecordDocument["videos"];
  reportAttachments: MaintenanceRecordDocument["report_attachments"];
  checklist: ChecklistItem[];
  completionConfirmation: boolean;
  managerConfirmationStatus: "pending" | "confirmed";
  shouldConfirmOnCreate: boolean;
  managerConfirmedAt?: Date;
  user: Pick<User, "_id" | "full_name" | "role">;
  responsibleTechnicianId: string;
  responsibleTechnicianName: string;
  responsibleTechnicianType?: "mekanik" | "elektromekanik";
  technicianSource: "internal" | "external_service";
  externalServiceName?: string;
  otherTechnicians: NonNullable<MaintenanceRecordDocument["other_technicians"]>;
  technicianContributions: MaintenanceTechnicianContribution[];
  clientRequestId?: string;
  createdAt: Date;
  backdated: boolean;
  groupId: string;
  typeKey: string;
  typeLabel: string;
  isPrimary: boolean;
  trackingAutoCreated?: boolean;
  previousTrackingState?: unknown;
  pressureReading?: number;
  session?: ClientSession;
}): Promise<void> {
  const {
    db,
    recordsCol,
    engineId,
    engineName,
    hourAtCompletion,
    maintenanceStartAt,
    maintenanceEndAt,
    maintenanceDurationMinutes,
    note,
    technicianNote,
    photosB64,
    photos,
    videos,
    reportAttachments,
    checklist,
    completionConfirmation,
    managerConfirmationStatus,
    shouldConfirmOnCreate,
    managerConfirmedAt,
    user,
    responsibleTechnicianId,
    responsibleTechnicianName,
    responsibleTechnicianType,
    technicianSource,
    externalServiceName,
    otherTechnicians,
    technicianContributions,
    clientRequestId,
    createdAt,
    backdated,
    groupId,
    typeKey,
    typeLabel,
    isPrimary,
    trackingAutoCreated,
    previousTrackingState,
    pressureReading,
    session,
  } = params;
  const rec: MaintenanceRecordDocument = {
    engine_id: engineId,
    engine_name: engineName,
    type_key: typeKey,
    type_label: typeLabel,
    hour_at_completion: hourAtCompletion,
    ...(maintenanceStartAt && maintenanceEndAt && maintenanceDurationMinutes
      ? {
          time_tracking_version: 2,
          maintenance_start_at: maintenanceStartAt,
          maintenance_end_at: maintenanceEndAt,
          maintenance_duration_minutes: maintenanceDurationMinutes,
        }
      : {}),
    note: isPrimary ? note || "" : "",
    technician_note: isPrimary ? technicianNote || "" : "",
    photos_b64: isPrimary ? photosB64 || [] : [],
    photos: isPrimary ? photos || [] : [],
    videos: isPrimary ? videos || [] : [],
    report_attachments: isPrimary ? reportAttachments : [],
    checklist: isPrimary ? checklist : [],
    ...(isPrimary && completionConfirmation ? { completion_confirmed_at: new Date() } : {}),
    manager_confirmation_status: managerConfirmationStatus,
    ...(shouldConfirmOnCreate && managerConfirmedAt
      ? {
          manager_confirmed_at: managerConfirmedAt,
          manager_confirmed_by_id: user._id,
          manager_confirmed_by_name: user.full_name,
          manager_confirmed_by_role: user.role,
        }
      : {}),
    technician_id: responsibleTechnicianId,
    technician_name: responsibleTechnicianName,
    ...(responsibleTechnicianType ? { technician_type: responsibleTechnicianType } : {}),
    technician_source: technicianSource,
    ...(technicianSource === "external_service" && externalServiceName ? { external_service_name: externalServiceName } : {}),
    other_technician_ids: otherTechnicians.map((technician) => technician.id),
    other_technicians: otherTechnicians,
    technician_contributions: technicianContributions,
    client_request_id: clientRequestId || undefined,
    created_at: createdAt,
    backdated,
    group_id: groupId,
    grouped_with: isPrimary ? null : typeLabel,
    ...(trackingAutoCreated ? { auto_created_tracking: true } : {}),
    ...(previousTrackingState ? { tracking_state_before: previousTrackingState } : {}),
  };
  if (isPrimary && typeof pressureReading === "number") rec.pressure_reading = pressureReading;
  await recordsCol.insertOne(rec, session ? { session } : undefined);
  await recomputeLastMaintenance(db, engineId, typeKey, undefined, session);
}
