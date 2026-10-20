import { getMaintenanceWorkDurationMinutes } from "./maintenanceTime.ts";

export interface MaintenanceTrendRecord {
  _id?: string;
  type_key?: string;
  type_label?: string;
  maintenance_start_at?: string | Date;
  maintenance_end_at?: string | Date;
  maintenance_duration_minutes?: number;
  duration_minutes?: number;
  created_at?: string | Date;
  group_id?: string | null;
  grouped_with?: string | null;
  technician_contributions?: Array<{ contribution_role?: string; duration_minutes?: number }>;
  hour_at_completion?: number;
  status?: string;
}

export interface MaintenanceTypeDurationSummary {
  type: string;
  count: number;
  minutes: number;
  estimatedCount: number;
}

const MAX_DURATION_MINUTES = 366 * 24 * 60;

export function eventDate(record: MaintenanceTrendRecord): Date | null {
  const value = record.maintenance_start_at || record.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Trendler, varsa baş/sorumlu teknisyenin çalışma süresini temel alır. */
export function durationMinutes(record: MaintenanceTrendRecord): number {
  const recordedWorkDuration = getMaintenanceWorkDurationMinutes(record);
  if (recordedWorkDuration !== null) return recordedWorkDuration;

  if (record.maintenance_start_at && record.maintenance_end_at) {
    const start = new Date(record.maintenance_start_at).getTime();
    const end = new Date(record.maintenance_end_at).getTime();
    const calculated = (end - start) / 60_000;
    if (Number.isFinite(calculated) && calculated > 0 && calculated <= MAX_DURATION_MINUTES) return calculated;
  }
  return 0;
}

function groupKey(record: MaintenanceTrendRecord, index: number): string {
  return record.group_id ? `group:${record.group_id}` : `record:${record._id || index}`;
}

function typeKey(record: MaintenanceTrendRecord): string {
  return record.type_key || record.type_label || "other";
}

function typeLabel(record: MaintenanceTrendRecord): string {
  return record.type_label || "Diğer";
}

function primaryRecord(records: MaintenanceTrendRecord[]): MaintenanceTrendRecord {
  return records.find((record) => record.grouped_with == null) || records[0];
}

export function uniqueMaintenanceEvents(records: MaintenanceTrendRecord[]): MaintenanceTrendRecord[] {
  const grouped = new Map<string, MaintenanceTrendRecord>();
  records.forEach((record, index) => {
    const key = groupKey(record, index);
    const current = grouped.get(key);
    if (!current || (current.grouped_with != null && record.grouped_with == null)) grouped.set(key, record);
  });
  return [...grouped.values()];
}

function average(values: number[]): number | null {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

/**
 * Birleşik bakımın ana türü sorumlu teknisyenin tüm çalışma süresini korur.
 * Ek türler, aynı motordaki tek tür kayıtlarının ortalamasından tahmin edilir.
 */
export function maintenanceTypeDurationSummaries(records: MaintenanceTrendRecord[]): MaintenanceTypeDurationSummary[] {
  const groups = new Map<string, MaintenanceTrendRecord[]>();
  records.forEach((record, index) => {
    const key = groupKey(record, index);
    groups.set(key, [...(groups.get(key) || []), record]);
  });

  const singleTypeDurations = new Map<string, number[]>();
  const allSingleDurations: number[] = [];
  for (const group of groups.values()) {
    const distinct = new Map<string, MaintenanceTrendRecord>();
    group.forEach((record) => distinct.set(typeKey(record), record));
    if (distinct.size !== 1) continue;
    const [key, record] = [...distinct.entries()][0];
    const duration = durationMinutes(record);
    if (duration <= 0) continue;
    singleTypeDurations.set(key, [...(singleTypeDurations.get(key) || []), duration]);
    allSingleDurations.push(duration);
  }

  const globalAverage = average(allSingleDurations);
  const summaries = new Map<string, MaintenanceTypeDurationSummary>();
  const add = (record: MaintenanceTrendRecord, minutes: number, estimated: boolean) => {
    const key = typeKey(record);
    const summary = summaries.get(key) || { type: typeLabel(record), count: 0, minutes: 0, estimatedCount: 0 };
    summary.count += 1;
    summary.minutes += minutes;
    if (estimated) summary.estimatedCount += 1;
    summaries.set(key, summary);
  };

  for (const group of groups.values()) {
    const distinct = new Map<string, MaintenanceTrendRecord>();
    group.forEach((record) => distinct.set(typeKey(record), record));
    const entries = [...distinct.entries()];
    if (entries.length === 1) {
      add(entries[0][1], durationMinutes(entries[0][1]), false);
      continue;
    }

    const primary = primaryRecord(group);
    const primaryTypeKey = typeKey(primary);
    const primaryEntry = entries.find(([key]) => key === primaryTypeKey);
    const primaryTypeRecord = primaryEntry?.[1] || primary;
    const primaryDuration = durationMinutes(primary) || Math.max(...group.map(durationMinutes));
    add(primaryTypeRecord, primaryDuration, false);

    const fallbackExtraDuration = Math.round(primaryDuration / entries.length);
    entries.forEach(([key, record]) => {
      if (key === primaryTypeKey) return;
      const estimatedDuration = Math.round(average(singleTypeDurations.get(key) || []) || globalAverage || fallbackExtraDuration);
      add(record, estimatedDuration, true);
    });
  }

  return [...summaries.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes);
}
