import { formatUnknownDate } from "@/lib/assistantToolOutput";
import type { MaintenanceWorkRow } from "./types";

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(Math.trunc(concurrency), 1), items.length);
  const runWorker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };
  if (workerCount > 0) await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export function buildMaintenanceWorkIndex(records: Array<Record<string, unknown>>): Map<string, MaintenanceWorkRow> {
  const eventRows = new Map<string, { pairKey: string; duration: number; completedAt: string | null }>();
  records.forEach((record, recordIndex) => {
    const engineId = String(record.engine_id || "");
    const typeKey = String(record.type_key || record.type_label || "");
    if (!engineId || !typeKey) return;
    const pairKey = `${engineId}|${typeKey}`;
    const eventKey = `${pairKey}|${String(record.group_id || record._id || record.maintenance_start_at || record.created_at || recordIndex)}`;
    const duration = Math.max(0, Number(record.maintenance_duration_minutes || 0));
    const completedAt = formatUnknownDate(record.maintenance_start_at || record.created_at);
    const previous = eventRows.get(eventKey);
    if (!previous || duration >= previous.duration) eventRows.set(eventKey, { pairKey, duration, completedAt });
  });
  const index = new Map<string, MaintenanceWorkRow>();
  [...eventRows.values()].forEach((event) => {
    const current = index.get(event.pairKey) || { total_duration_minutes: 0, last_duration_minutes: 0, completed_count: 0, last_completed_at: null };
    current.total_duration_minutes += event.duration;
    current.completed_count += 1;
    if (!current.last_completed_at || (event.completedAt && event.completedAt > current.last_completed_at)) {
      current.last_completed_at = event.completedAt;
      current.last_duration_minutes = event.duration;
    }
    index.set(event.pairKey, current);
  });
  return index;
}
