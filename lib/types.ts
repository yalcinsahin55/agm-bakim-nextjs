// 📚 Ortak tip tanımları — tüm uygulama bu tipleri kullanacak

export type Role = "yonetici" | "planlamaci" | "teknisyen" | "goruntuleyici";

export interface User {
  _id: string;
  full_name: string;
  email?: string;
  phone?: string;
  phone_normalized?: string;
  password_hash: string;
  role: Role;
  active: boolean;
  approved?: boolean;
  created_at: Date | string;
}

export interface EngineHistoryEntry {
  date: string;
  hours: number;
  load_kw: number;
}

export interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw: number;
  updated_at: Date | string;
  history: EngineHistoryEntry[];
}

export interface EngineState {
  last_maintenance_hour: number;
  period_hours: number;
}

export interface MaintenanceType {
  _id: string;
  key: string;
  label: string;
  default_period_hours: number;
  engine_states: Record<string, EngineState>;
}

export interface VideoRef {
  url?: string;
  data_b64?: string;
  filename?: string;
  mime?: string;
}

export interface MaintenanceRecord {
  _id: string;
  engine_id: string;
  engine_name: string;
  type_key: string;
  type_label: string;
  hour_at_completion: number;
  time_tracking_version?: 2;
  maintenance_start_at?: Date | string;
  maintenance_end_at?: Date | string;
  maintenance_duration_minutes?: number;
  note?: string;
  technician_note?: string;
  photos_b64?: string[];
  photos?: string[];
  videos?: (VideoRef | string)[];
  pressure_reading?: number;
  technician_id: string;
  technician_name: string;
  other_technician_ids?: string[];
  other_technicians?: Array<{ id: string; full_name: string }>;
  checklist?: Array<{ label: string; completed: boolean }>;
  completion_confirmed_at?: Date | string;
  created_at: Date | string;
  backdated?: boolean;
  group_id?: string;
  grouped_with?: string | null;
}

export interface PressureReading {
  _id?: string;
  engine_id: string;
  engine_name: string;
  reading_date: Date | string;
  load_kw: number;
  pressure_bar: number;
  status?: string | null;
  new_type?: boolean;
  note?: string | null;
  uploaded_by?: string;
  created_at?: Date | string;
}

export interface EquipmentInfo {
  _id?: string;
  engine_name: string;
  kaver_tipi?: string;
  hava_filtresi?: string;
  krankcase?: string;
  esanjor_tipi?: string;
  dungs?: string;
  radyator_tipi?: string;
  not?: string;
}

export interface SessionUser {
  id: string;
  full_name: string;
  role: Role;
}

export type NotificationStatus = "gecikmis" | "kritik" | "yaklasiyor" | "system";

export interface Notification {
  _id?: string;
  user_id: string;
  type: "maintenance" | "system";
  status: NotificationStatus;
  title: string;
  message: string;
  href?: string;
  dedupe_key?: string;
  read_at?: Date | string | null;
  created_at: Date | string;
  updated_at?: Date | string;
}
