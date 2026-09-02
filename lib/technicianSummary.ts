export interface TechnicianSummaryRow {
  technician_id: string;
  technician: string;
  total_count: number;
  total_duration_minutes: number;
  [key: string]: unknown;
}

export function sortTechnicianSummary<T extends TechnicianSummaryRow>(rows: readonly T[], limit = 12): T[] {
  return [...rows]
    .sort((a, b) => b.total_duration_minutes - a.total_duration_minutes || b.total_count - a.total_count || a.technician.localeCompare(b.technician, "tr"))
    .slice(0, limit);
}
