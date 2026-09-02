import type { ClientSession, Db } from "mongodb";
import { writeAuditLog, type AuditInput } from "@/lib/audit";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";

type RecordUpdate = Partial<MaintenanceRecordDocument> & { $unset?: Record<string, ""> };
type AuditUser = AuditInput["user"];

export async function writeRecordPatchAudit(params: {
  db: Db;
  user: AuditUser;
  id: string;
  record: MaintenanceRecordDocument;
  update: RecordUpdate;
  engineChangeRequested: boolean;
  effectiveEngineId: string;
  effectiveEngineName: string;
  movedRecordIds: string[];
  session?: ClientSession;
}): Promise<void> {
  const {
    db,
    user,
    id,
    record,
    update,
    engineChangeRequested,
    effectiveEngineId,
    effectiveEngineName,
    movedRecordIds,
    session,
  } = params;

  await writeAuditLog(db, {
    user,
    action: "update",
    entity: "maintenance_record",
    entityId: id,
    summary: `${record.engine_name} · ${record.type_label} bakım kaydı güncellendi${engineChangeRequested ? `; motor ${record.engine_name} → ${effectiveEngineName} taşındı` : ""}`,
    before: record,
    after: {
      ...update,
      ...(engineChangeRequested
        ? { engine_id: effectiveEngineId, engine_name: effectiveEngineName, moved_record_ids: movedRecordIds }
        : {}),
    },
    session,
  });
}
