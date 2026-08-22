import type { Db } from "mongodb";

export interface TechnicianOption {
  id: string;
  full_name: string;
}

const TECHNICIAN_ROLES = ["teknisyen", "planlamaci"];

export async function listActiveTechnicians(db: Db): Promise<TechnicianOption[]> {
  const users = await db.collection("users").find(
    {
      role: { $in: TECHNICIAN_ROLES },
      active: { $ne: false },
      approved: { $ne: false },
    },
    { projection: { _id: 1, full_name: 1 } },
  ).toArray();

  return users
    .filter((user) => user._id != null && typeof user.full_name === "string" && user.full_name.trim())
    .map((user) => ({ id: String(user._id), full_name: (user.full_name as string).trim() }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
}

export async function resolveTechnicianOptions(db: Db, ids: unknown): Promise<TechnicianOption[] | null> {
  if (!Array.isArray(ids)) return [];
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (uniqueIds.length > 20) return null;

  const technicians = await listActiveTechnicians(db);
  const byId = new Map(technicians.map((technician) => [technician.id, technician]));
  if (uniqueIds.some((id) => !byId.has(id))) return null;
  return uniqueIds.map((id) => byId.get(id)!);
}
