import type { ObjectId } from "mongodb";
import type {
  Engine,
  EquipmentInfo,
  MaintenanceRecord,
  MaintenanceType,
  Notification,
  PressureReading,
  Role,
  TechnicianType,
  User,
  WorkDomain,
} from "@/lib/types";

export type MongoId = string | ObjectId;
export type AuditAction = "create" | "update" | "delete" | "login" | "export" | "upload";

export type UserDocument = User;
export type EngineDocument = Engine & {
  maintenance_count?: number;
};
export type MaintenanceTypeDocument = MaintenanceType;

export type MaintenanceRecordDocument = Omit<MaintenanceRecord, "_id" | "created_at"> & {
  _id?: MongoId;
  created_at?: Date | string;
  technician_type?: TechnicianType;
  client_request_id?: string;
  auto_created_tracking?: boolean;
  tracking_state_before?: unknown;
};

export type PressureReadingDocument = Omit<PressureReading, "_id"> & {
  _id?: MongoId;
  uploaded_by_id?: string;
  created_at?: Date | string;
};
export type EquipmentInfoDocument = Omit<EquipmentInfo, "_id"> & { _id?: MongoId };
export type NotificationDocument = Omit<Notification, "_id"> & { _id?: MongoId };

export interface OilAnalysisDocument {
  _id?: MongoId;
  engine_id: string;
  engine_name: string;
  analysis_date: Date | string;
  result?: string;
  note?: string;
  pdf_url?: string;
  pdf_b64?: string;
  pdf_filename?: string;
  uploaded_by?: string;
  uploaded_by_id?: string;
  created_at?: Date | string;
}

export interface AuditLogDocument {
  _id?: MongoId;
  user_id: string;
  user_name: string;
  user_role: Role;
  action: AuditAction;
  entity: string;
  entity_id?: string | null;
  request_id?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  created_at: Date | string;
}

export interface PushSubscriptionDocument {
  _id?: MongoId;
  endpoint: string;
  user_id: string;
  subscription?: unknown;
  p256dh?: string;
  auth?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface VideoChunkDocument {
  _id?: MongoId;
  upload_id: string;
  owner_id: string;
  index: number;
  total?: number;
  chunk_b64: string;
  at?: Date | string;
  created_at?: Date | string;
}

export interface EquipmentInfoDocumentWithFields {
  _id?: MongoId;
  engine_name: string;
  kaver_tipi?: string | null;
  hava_filtresi?: string | null;
  krankcase?: string | null;
  esanjor_tipi?: string | null;
  dungs?: string | null;
  radyator_tipi?: string | null;
  not?: string | null;
}

export interface TechnicianSnapshot {
  id: string;
  full_name: string;
  technician_type?: TechnicianType;
}

export interface TrackingStateDocument {
  last_maintenance_hour?: number;
  period_hours?: number;
  tracking_source?: "manual" | "record";
}

export interface DynamicEngineStateDocument {
  engine_states?: Record<string, TrackingStateDocument>;
}

export interface SeedTechnicianPermissions {
  technician_type?: TechnicianType;
  can_be_responsible?: boolean;
  can_be_support?: boolean;
  allowed_work_domains?: WorkDomain[];
}

export type MaintenanceRecordInputDocument = Omit<MaintenanceRecordDocument, "_id">;
