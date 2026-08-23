import type { Db } from "mongodb";
import { buildItems } from "@/lib/status";
import type { Engine, MaintenanceType } from "@/lib/types";
import { EXTERNAL_SERVICE_TECHNICIAN_ID } from "@/lib/technicians";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberParam(value: string | null): number | undefined {
  if (!value || !/^\d+(?:[.,]\d+)?$/.test(value)) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

async function healthStatusPairs(db: Db, status: string | null): Promise<Array<{ engine_id: string; type_key: string }>> {
  if (!status || !["overdue", "critical", "upcoming", "normal"].includes(status)) return [];
  const [engines, types] = await Promise.all([
    db.collection("engines").find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1, updated_at: 1, history: 1 } }).toArray(),
    db.collection("maintenance_types").find({}, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_states: 1 } }).toArray(),
  ]);
  const target = status === "overdue" ? "gecikmis" : status === "critical" ? "kritik" : status === "upcoming" ? "yaklasiyor" : "normal";
  return buildItems(engines as unknown as Engine[], types as unknown as MaintenanceType[])
    .filter((item) => item.status === target)
    .map((item) => ({ engine_id: item.engine_id, type_key: item.type_key }));
}

export async function buildMaintenanceRecordQuery(db: Db, searchParams: URLSearchParams): Promise<Record<string, unknown>> {
  const clauses: Record<string, unknown>[] = [];
  const engine = searchParams.get("engine_id")?.trim();
  const type = searchParams.get("type_label")?.trim();
  const source = searchParams.get("source")?.trim();
  const technician = searchParams.get("technician_id")?.trim();
  const role = searchParams.get("technician_role")?.trim();
  const from = dateParam(searchParams.get("from"));
  const to = dateParam(searchParams.get("to"), true);
  if (engine) clauses.push({ engine_id: engine });
  if (type) clauses.push({ type_label: type });
  if (source === "external_service") clauses.push({ $or: [{ technician_source: "external_service" }, { technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID }] });
  if (source === "internal") clauses.push({ technician_source: { $ne: "external_service" }, technician_id: { $ne: EXTERNAL_SERVICE_TECHNICIAN_ID } });
  if (technician) {
    if (role === "responsible") clauses.push({ technician_id: technician });
    else if (role === "support") clauses.push({ "other_technicians.id": technician });
    else clauses.push({ $or: [{ technician_id: technician }, { "other_technicians.id": technician }] });
  }
  if (from || to) {
    const range = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    clauses.push({ $or: [{ maintenance_start_at: range }, { $and: [{ $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }] }, { created_at: range }] }] });
  }
  const hourMin = numberParam(searchParams.get("hour_min"));
  const hourMax = numberParam(searchParams.get("hour_max"));
  if (hourMin !== undefined || hourMax !== undefined) clauses.push({ hour_at_completion: { ...(hourMin !== undefined ? { $gte: hourMin } : {}), ...(hourMax !== undefined ? { $lte: hourMax } : {}) } });
  const durationMin = numberParam(searchParams.get("duration_min"));
  const durationMax = numberParam(searchParams.get("duration_max"));
  if (durationMin !== undefined || durationMax !== undefined) clauses.push({ maintenance_duration_minutes: { ...(durationMin !== undefined ? { $gte: durationMin } : {}), ...(durationMax !== undefined ? { $lte: durationMax } : {}) } });
  const evidence = searchParams.get("evidence")?.trim();
  if (evidence === "photo") clauses.push({ $or: [{ "photos.0": { $exists: true } }, { "photos_b64.0": { $exists: true } }] });
  if (evidence === "video") clauses.push({ "videos.0": { $exists: true } });
  if (evidence === "note") clauses.push({ $or: [{ note: { $exists: true, $nin: [null, ""] } }, { technician_note: { $exists: true, $nin: [null, ""] } }] });
  if (evidence === "checklist") clauses.push({ "checklist.0": { $exists: true } });
  if (searchParams.get("team_only") === "true") clauses.push({ $or: [{ "other_technicians.0": { $exists: true } }, { "other_technician_ids.0": { $exists: true } }] });
  const recordFilters = new Set((searchParams.get("record_filter") || "").split(",").map((value) => value.trim()));
  if (recordFilters.has("backdated")) clauses.push({ backdated: true });
  if (recordFilters.has("missing_time")) clauses.push({ $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }, { maintenance_end_at: { $exists: false } }, { maintenance_end_at: null }] });
  if (recordFilters.has("unconfirmed")) clauses.push({ $or: [{ completion_confirmed_at: { $exists: false } }, { completion_confirmed_at: null }] });
  const healthPairs = await healthStatusPairs(db, searchParams.get("status"));
  if (searchParams.get("status") && ["overdue", "critical", "upcoming", "normal"].includes(searchParams.get("status") || "")) {
    clauses.push(healthPairs.length ? { $or: healthPairs } : { engine_id: "__assistant_no_matching_health_status__" });
  }
  const service = searchParams.get("service")?.trim();
  if (service) {
    const escaped = escapeRegex(service);
    clauses.push({ $or: [{ external_service_name: { $regex: escaped, $options: "i" } }, { technician_name: { $regex: escaped, $options: "i" } }] });
  }
  return clauses.length ? { $and: clauses } : {};
}
