export interface MotorEngine {
  _id: string;
  name: string;
  hours?: number;
  load_kw?: number;
  updated_at?: string | Date;
  maintenance_count?: number;
}

export interface MotorMaintenanceRecord {
  _id?: string;
  group_id?: string;
  type_key?: string;
  type_label?: string;
  hour_at_completion?: number;
  technician_name?: string;
  maintenance_start_at?: string | Date;
  created_at?: string | Date;
}

export interface EngineResponse {
  name?: string;
  error?: string;
}
