export interface PressureEngine {
  _id: string;
  name: string;
  hours?: number;
  load_kw?: number;
}

export interface PressureReading {
  _id: string;
  engine_id: string;
  reading_date: string | Date;
  load_kw?: number | null;
  pressure_bar?: number | null;
  status?: string;
  uploaded_by_id?: string;
}

export interface PressureEntry {
  maint?: boolean;
  load_kw?: string;
  pressure_bar?: string;
}

export type PressureTab = "new" | "history" | "import";

export interface ChartPoint {
  x?: number;
  y: number;
  label?: string;
}

export interface ImportResult {
  inserted?: number;
  error?: string;
}

export interface PressurePage {
  items: PressureReading[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}
