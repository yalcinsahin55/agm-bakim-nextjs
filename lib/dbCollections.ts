import type { Collection, Db } from "mongodb";
import type {
  AuditLogDocument,
  EngineDocument,
  EquipmentInfoDocumentWithFields,
  MaintenanceRecordDocument,
  MaintenanceTypeDocument,
  NotificationDocument,
  OilAnalysisDocument,
  PressureReadingDocument,
  PushSubscriptionDocument,
  UserDocument,
  VideoChunkDocument,
} from "@/lib/dbTypes";

export function usersCollection(db: Db): Collection<UserDocument> {
  return db.collection<UserDocument>("users");
}

export function enginesCollection(db: Db): Collection<EngineDocument> {
  return db.collection<EngineDocument>("engines");
}

export function maintenanceTypesCollection(db: Db): Collection<MaintenanceTypeDocument> {
  return db.collection<MaintenanceTypeDocument>("maintenance_types");
}

export function recordsCollection(db: Db): Collection<MaintenanceRecordDocument> {
  return db.collection<MaintenanceRecordDocument>("maintenance_records");
}

export function oilAnalysesCollection(db: Db): Collection<OilAnalysisDocument> {
  return db.collection<OilAnalysisDocument>("oil_analyses");
}

export function pressureReadingsCollection(db: Db): Collection<PressureReadingDocument> {
  return db.collection<PressureReadingDocument>("pressure_readings");
}

export function equipmentInfoCollection(db: Db): Collection<EquipmentInfoDocumentWithFields> {
  return db.collection<EquipmentInfoDocumentWithFields>("equipment_info");
}

export function notificationsCollection(db: Db): Collection<NotificationDocument> {
  return db.collection<NotificationDocument>("notifications");
}

export function auditLogsCollection(db: Db): Collection<AuditLogDocument> {
  return db.collection<AuditLogDocument>("audit_logs");
}

export function pushSubscriptionsCollection(db: Db): Collection<PushSubscriptionDocument> {
  return db.collection<PushSubscriptionDocument>("push_subscriptions");
}

export function videoChunksCollection(db: Db): Collection<VideoChunkDocument> {
  return db.collection<VideoChunkDocument>("video_chunks");
}
