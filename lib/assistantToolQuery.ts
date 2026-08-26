import type { Db } from "mongodb";
import { EXTERNAL_SERVICE_TECHNICIAN_ID } from "./technicians.ts";
import type { AssistantPeriod, AssistantQuery, AssistantStatusFilter } from "./assistantPolicy.ts";
import { enginesCollection, maintenanceTypesCollection } from "./dbCollections.ts";
import { dateKeyLabel } from "./maintenanceForecast.ts";
import { getOrBuildMaintenancePanelServerPayload } from "./maintenancePanelServer.ts";

export function currentTurkeyDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function periodStart(period: AssistantPeriod): Date | null {
  const today = currentTurkeyDateKey();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (period === "month") return new Date(Date.UTC(year, month, 1));
  if (period === "3months") return new Date(Date.UTC(year, month - 2, 1));
  if (period === "year") return new Date(Date.UTC(year, 0, 1));
  return null;
}

export function periodLabel(query: AssistantQuery): string {
  if (query.dateRange) return `${dateKeyLabel(query.dateRange.from)} - ${dateKeyLabel(query.dateRange.to)}`;
  return query.period === "month" ? "bu ay" : query.period === "3months" ? "son üç ay" : query.period === "year" ? "bu yıl" : "tüm dönem";
}

export function dateKeyStart(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function dateRangeClauses(field: "maintenance_start_at" | "created_at", from: Date, to?: Date): Array<Record<string, unknown>> {
  const dateRange: Record<string, unknown> = { $gte: from };
  if (to) dateRange.$lt = to;
  const isoRange: Record<string, unknown> = { $gte: from.toISOString() };
  if (to) isoRange.$lt = to.toISOString();
  return [{ [field]: dateRange }, { [field]: isoRange }];
}

export function periodMatch(query: AssistantQuery): Record<string, unknown> {
  const buildRangeMatch = (from: Date, to?: Date): Record<string, unknown> => ({
    $or: [
      ...dateRangeClauses("maintenance_start_at", from, to),
      {
        $and: [
          { $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }] },
          { $or: dateRangeClauses("created_at", from, to) },
        ],
      },
    ],
  });
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (from && to) {
      to.setUTCDate(to.getUTCDate() + 1);
      return buildRangeMatch(from, to);
    }
  }
  const start = periodStart(query.period);
  return start ? buildRangeMatch(start) : {};
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function externalExpression() {
  return {
    $or: [
      { $eq: ["$technician_source", "external_service"] },
      { $eq: ["$technician_id", EXTERNAL_SERVICE_TECHNICIAN_ID] },
    ],
  };
}

export async function resolveMaintenanceType(db: Db, query: AssistantQuery) {
  if (!query.maintenanceTypeQuery) return null;
  const value = query.maintenanceTypeQuery.trim();
  if (!value) return null;
  const escaped = escapeRegex(value);
  return maintenanceTypesCollection(db).findOne(
    { is_deleted: { $ne: true }, $or: [{ key: value }, { label: { $regex: escaped, $options: "i" } }] },
    { projection: { key: 1, label: 1 } },
  );
}

export async function statusPairs(db: Db, status: AssistantStatusFilter | undefined): Promise<Array<{ engine_id: string; type_key: string }>> {
  if (!status) return [];
  const { items } = await getOrBuildMaintenancePanelServerPayload(db);
  const targetStatus = status === "overdue" ? "gecikmis" : status === "critical" ? "kritik" : status === "upcoming" ? "yaklasiyor" : "normal";
  return items
    .filter((item) => item.status === targetStatus)
    .map((item) => ({ engine_id: item.engine_id, type_key: item.type_key }));
}

export async function findEngine(db: Db, engineQuery: string) {
  const value = engineQuery.trim();
  const escaped = escapeRegex(value);
  const engines = enginesCollection(db);
  const projection = { projection: { _id: 1, name: 1, hours: 1 } };
  const exact = await engines.findOne(
    { $or: [{ _id: value }, { name: { $regex: `^${escaped}$`, $options: "i" } }] },
    projection,
  );
  if (exact) return exact;
  const agmName = value.match(/^agm[-\s]?(\d{1,3})$/iu);
  if (agmName) {
    const normalizedAgm = await engines.findOne({ name: { $regex: `^agm[-\\s]?${agmName[1]}$`, $options: "i" } }, projection);
    if (normalizedAgm) return normalizedAgm;
  }
  return engines.findOne({ name: { $regex: escaped, $options: "i" } }, projection);
}

export async function buildRecordMatch(db: Db, query: AssistantQuery, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const clauses: Array<Record<string, unknown>> = [];
  const timeMatch = periodMatch(query);
  if (Object.keys(timeMatch).length > 0) clauses.push(timeMatch);
  if (Object.keys(extra).length > 0) clauses.push(extra);
  if (query.engineQuery) {
    const engine = await findEngine(db, query.engineQuery);
    clauses.push({ engine_id: engine ? String(engine._id) : "__assistant_no_matching_engine__" });
  }
  if (query.sourceFilter === "external_service") clauses.push({ $or: [{ technician_source: "external_service" }, { technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID }] });
  if (query.sourceFilter === "internal") clauses.push({ technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } });
  if (query.hourRange && (query.hourRange.min !== undefined || query.hourRange.max !== undefined)) clauses.push({ hour_at_completion: { ...(query.hourRange.min !== undefined ? { $gte: query.hourRange.min } : {}), ...(query.hourRange.max !== undefined ? { $lte: query.hourRange.max } : {}) } });
  if (query.durationRange && (query.durationRange.min !== undefined || query.durationRange.max !== undefined)) clauses.push({ maintenance_duration_minutes: { ...(query.durationRange.min !== undefined ? { $gte: query.durationRange.min } : {}), ...(query.durationRange.max !== undefined ? { $lte: query.durationRange.max } : {}) } });
  if (query.evidenceFilter === "photo") clauses.push({ $or: [{ "photos.0": { $exists: true } }, { "photos_b64.0": { $exists: true } }] });
  if (query.evidenceFilter === "video") clauses.push({ "videos.0": { $exists: true } });
  if (query.evidenceFilter === "note") clauses.push({ $or: [{ note: { $exists: true, $nin: [null, ""] } }, { technician_note: { $exists: true, $nin: [null, ""] } }] });
  if (query.evidenceFilter === "checklist") clauses.push({ "checklist.0": { $exists: true } });
  if (query.teamOnly) clauses.push({ $or: [{ "other_technicians.0": { $exists: true } }, { "other_technician_ids.0": { $exists: true } }] });
  if (query.recordFilters?.includes("backdated")) clauses.push({ backdated: true });
  if (query.recordFilters?.includes("missing_time")) clauses.push({ $or: [
    { maintenance_start_at: { $exists: false } },
    { maintenance_start_at: null },
    { maintenance_end_at: { $exists: false } },
    { maintenance_end_at: null },
  ] });
  if (query.recordFilters?.includes("unconfirmed")) clauses.push({ manager_confirmation_status: "pending" });
  const type = await resolveMaintenanceType(db, query);
  if (query.maintenanceTypeQuery) clauses.push(type ? { $or: [{ type_key: type.key }, { type_label: type.label }] } : { type_key: "__assistant_no_matching_type__" });
  if (query.excludedTypeLabels?.length) clauses.push({ type_label: { $nin: query.excludedTypeLabels.slice(0, 30) } });
  if (query.statusFilter) {
    const pairs = await statusPairs(db, query.statusFilter);
    clauses.push(pairs.length ? { $or: pairs } : { engine_id: "__assistant_no_matching_status__" });
  }
  return clauses.length ? { $and: clauses } : {};
}

export async function internalRecordMatch(db: Db, query: AssistantQuery, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const base = await buildRecordMatch(db, query, extra);
  return {
    $and: [
      base,
      { technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } },
    ],
  };
}

export function dataDateMatch(field: string, query: AssistantQuery): Record<string, unknown> {
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (from && to) {
      to.setUTCDate(to.getUTCDate() + 1);
      return { [field]: { $gte: from, $lt: to } };
    }
  }
  const start = periodStart(query.period);
  return start ? { [field]: { $gte: start } } : {};
}

export function isDateInAssistantQuery(value: unknown, query: AssistantQuery): boolean {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return false;
  if (query.dateRange) {
    const from = dateKeyStart(query.dateRange.from);
    const to = dateKeyStart(query.dateRange.to);
    if (!from || !to) return false;
    to.setUTCDate(to.getUTCDate() + 1);
    return date >= from && date < to;
  }
  const start = periodStart(query.period);
  return !start || date >= start;
}

export function historyDayKey(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
