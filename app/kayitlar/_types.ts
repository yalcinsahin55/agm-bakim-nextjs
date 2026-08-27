import type { ReportAttachment } from "@/lib/types";

export interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

export interface MaintenanceType {
  _id: string;
  key: string;
  label: string;
  default_period_hours: number;
  work_domains?: Array<"mechanical" | "electrical" | "commissioning">;
  allow_electromechanical_support?: boolean;
  allow_electromechanical_responsible?: boolean;
  engine_scope?: "all" | "explicit";
  engine_states?: Record<string, { period_hours?: number; last_maintenance_hour?: number; tracking_source?: string }>;
}

export interface VideoItem {
  url?: string;
  filename?: string;
  mime?: string;
  data_b64?: string;
}

export interface MaintenanceRecord {
  _id: string;
  engine_id: string;
  engine_name: string;
  type_key: string;
  type_label: string;
  hour_at_completion: number;
  time_tracking_version?: 2;
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  technician_note?: string;
  photos_b64?: string[];
  photos?: string[];
  videos?: VideoItem[];
  pressure_reading?: number;
  created_at: string;
  technician_name: string;
  technician_id: string;
  technician_type?: "mekanik" | "elektromekanik";
  technician_source?: "internal" | "external_service";
  external_service_name?: string;
  other_technician_ids?: string[];
  other_technicians?: Array<{ id: string; full_name: string; technician_type?: "mekanik" | "elektromekanik" }>;
  extra_types?: Array<{ type_key: string; type_label: string }>;
  technician_contributions?: Array<{ id: string; full_name: string; technician_type?: "mekanik" | "elektromekanik"; contribution_role: "responsible" | "support"; duration_minutes: number }>;

  checklist?: Array<{ label: string; completed: boolean }>;
  completion_confirmed_at?: string;
  manager_confirmation_status?: "pending" | "confirmed";
  manager_confirmed_at?: string;
  manager_confirmed_by_id?: string;
  manager_confirmed_by_name?: string;
  manager_confirmed_by_role?: string;
  group_id?: string | null;
  group_types?: Array<{ type_key: string; type_label: string }>;
  report_attachments?: ReportAttachment[];
}

export interface ConfirmationContributionRow {
  id: string;
  full_name: string;
  technician_type?: "mekanik" | "elektromekanik";
  contribution_role: "responsible" | "support";
  duration_minutes?: number;
}
