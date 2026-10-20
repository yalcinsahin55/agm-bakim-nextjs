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
  const responsibleDuration = record.technician_contributions?.find((item) => item.contribution_role === "responsible")?.duration_minutes;
  const responsible = Number(responsibleDuration);
  if (Number.isFinite(responsible) && responsible > 0 && responsible <= MAX_DURATION_MINUTES) return responsible;

  const stored = Number(record.maintenance_duration_minutes ?? record.duration_minutes);
  if (Number.isFinite(stored) && stored > 0 && stored <= MAX_DURATION_MINUTES) return stored;

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

function allocateByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safeWeights = weights.map((weight) => Number.isFinite(weight) && weight > 0 ? weight : 1);
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const rawShares = safeWeights.map((weight) => total * weight / weightTotal);
  const shares = rawShares.map(Math.floor);
  let remaining = Math.max(0, total - shares.reduce((sum, share) => sum + share, 0));
  const remainders = rawShares
    .map((share, index) => ({ index, remainder: share - shares[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remaining; index += 1) shares[remainders[index % remainders.length].index] += 1;
  return shares;
}

/**
 * Tek tür olaylarda kaydedilen süre gerçek referans kabul edilir. Birleşik bakımda
 * ortak toplam baş teknisyen süresidir; türlere, kendi geçmiş tekil süre ortalamaları
 * oranında paylaştırılır. Böylece aynı ortak süre her türe tekrar yazılmaz.
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
    const sharedDuration = durationMinutes(primary) || Math.max(...group.map(durationMinutes));
    const weights = entries.map(([key]) => average(singleTypeDurations.get(key) || []) || globalAverage || 1);
    const allocations = allocateByWeights(sharedDuration, weights);
    entries.forEach(([, record], index) => add(record, allocations[index], true));
  }

  return [...summaries.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes);
}
