import type { ClientSession, Db } from "mongodb";
import { buildEngineStateUpdate } from "@/lib/maintenance";
import { maintenanceTypesCollection } from "@/lib/dbCollections";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import type { MaintenanceTechnicianContribution, MaintenanceType, User } from "@/lib/types";

type ExtraType = {
  type_key: string;
  type_label?: string;
  period?: number;
};

type RecordsCollection = ReturnType<typeof import("@/lib/dbCollections").recordsCollection>;

type Technician = {
  id: string;
  full_name: string;
  technician_type: "mekanik" | "elektromekanik";
};

export async function createGroupedExtraRecords(params: {
  db: Db;
  recordsCol: RecordsCollection;
  record: MaintenanceRecordDocument;
  extraTypes: ExtraType[];
  clientRequestId?: string;
  groupId?: string | null;
  effectiveEngineId: string;
  effectiveEngineName: string;
  finalHour: number;
  nextStartAt?: Date;
  nextEndAt?: Date;
  nextDurationMinutes: number | null;
  user: Pick<User, "_id" | "full_name" | "role">;
  useExternalService: boolean;
  externalServiceName: string;
  nextResponsibleId: string;
  nextResponsibleName: string;
  nextResponsibleType?: "mekanik" | "elektromekanik";
  effectiveOtherTechnicians: Technician[];
  technicianContributions: MaintenanceTechnicianContribution[];
  selectedTypeDocs: Array<Pick<MaintenanceType, "_id" | "label" | "engine_states">>;
  session?: ClientSession;
}): Promise<void> {
  const {
    db,
    recordsCol,
    record,
    extraTypes,
    clientRequestId,
    groupId,
    effectiveEngineId,
    effectiveEngineName,
    finalHour,
    nextStartAt,
    nextEndAt,
    nextDurationMinutes,
    user,
    useExternalService,
    externalServiceName,
    nextResponsibleId,
    nextResponsibleName,
    nextResponsibleType,
    effectiveOtherTechnicians,
    technicianContributions,
    selectedTypeDocs,
    session,
  } = params;
  const options = session ? { session } : {};
  if (!groupId) throw new Error("Bakım grubu oluşturulamadı.");

  const extraManagerConfirmationStatus = record.manager_confirmation_status || (user.role === "yonetici" ? "confirmed" : "pending");
  const extraManagerConfirmedAt = extraManagerConfirmationStatus === "confirmed" ? new Date() : undefined;
  const typesCol = maintenanceTypesCollection(db);

  for (const ex of extraTypes) {
    const extraClientRequestId = `${clientRequestId || `record:${String(record._id)}`}:extra:${String(ex.type_key)}`;
    const existingExtra = await recordsCol.findOne(
      {
        $or: [
          { group_id: groupId, type_key: ex.type_key },
          { client_request_id: extraClientRequestId },
        ],
      },
      { projection: { _id: 1 }, ...options },
    );
    if (existingExtra) continue;

    if (typeof ex.period === "number" && isSafeMongoPathSegment(effectiveEngineId)) {
      const extraTypeState = selectedTypeDocs.find((type) => String(type._id) === ex.type_key)?.engine_states;
      await typesCol.updateOne(
        { _id: ex.type_key },
        { $set: buildEngineStateUpdate(extraTypeState, effectiveEngineId, { period_hours: ex.period }) },
        { upsert: true, ...options },
      );
    }

    const extraType = selectedTypeDocs.find((type) => String(type._id) === ex.type_key);
    await recordsCol.insertOne({
      engine_id: effectiveEngineId,
      engine_name: effectiveEngineName,
      type_key: ex.type_key,
      type_label: extraType?.label || ex.type_label || ex.type_key,
      hour_at_completion: finalHour,
      ...(nextStartAt && nextEndAt && nextDurationMinutes
        ? {
            time_tracking_version: 2,
            maintenance_start_at: nextStartAt,
            maintenance_end_at: nextEndAt,
            maintenance_duration_minutes: nextDurationMinutes,
          }
        : {}),
      note: "",
      technician_note: "",
      photos_b64: [],
      photos: [],
      videos: [],
      report_attachments: [],
      manager_confirmation_status: extraManagerConfirmationStatus,
      ...(extraManagerConfirmedAt
        ? {
            manager_confirmed_at: extraManagerConfirmedAt,
            manager_confirmed_by_id: user._id,
            manager_confirmed_by_name: user.full_name,
            manager_confirmed_by_role: user.role,
          }
        : {}),
      technician_id: nextResponsibleId,
      technician_name: nextResponsibleName,
      ...(useExternalService
        ? { technician_source: "external_service", ...(externalServiceName ? { external_service_name: externalServiceName } : {}) }
        : { technician_source: "internal" }),
      other_technician_ids: useExternalService ? [] : effectiveOtherTechnicians.map((technician) => technician.id),
      other_technicians: useExternalService ? [] : effectiveOtherTechnicians,
      technician_contributions: technicianContributions,
      client_request_id: extraClientRequestId,
      ...(useExternalService ? {} : { technician_type: nextResponsibleType }),
      created_at: record.created_at,
      backdated: !!record.backdated,
      group_id: groupId,
      grouped_with: record.type_label,
    }, options);
  }
}
