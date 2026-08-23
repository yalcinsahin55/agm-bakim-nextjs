import type { Db } from "mongodb";
import type { TechnicianType } from "@/lib/types";

export const TECHNICIAN_TYPE_LABELS: Record<TechnicianType, string> = {
  mekanik: "Mekanik teknisyen",
  elektromekanik: "Elektromekanik teknisyen",
};

export function normalizeTechnicianType(value: unknown): TechnicianType {
  return value === "elektromekanik" ? "elektromekanik" : "mekanik";
}

export interface TechnicianOption {
  id: string;
  full_name: string;
  technician_type: TechnicianType;
}

export const EXTERNAL_SERVICE_TECHNICIAN_ID = "__external_service__" as const;
export const EXTERNAL_SERVICE_TECHNICIAN_NAME = "Dış Hizmet / Harici Servis";

const TECHNICIAN_ROLES = ["teknisyen", "planlamaci"];

/** Aynı kişinin büyük-küçük harf, Unicode ve fazla boşluk farklarını tek anahtarda birleştirir. */
export function normalizeTechnicianName(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR")
    : "";
}

export async function listActiveTechnicians(db: Db): Promise<TechnicianOption[]> {
  const users = await db.collection("users").find(
    {
      role: { $in: TECHNICIAN_ROLES },
      active: { $ne: false },
      approved: { $ne: false },
    },
    { projection: { _id: 1, full_name: 1, technician_type: 1 } },
  ).toArray();

  return users
    .filter((user) => user._id != null && typeof user.full_name === "string" && user.full_name.trim())
    .map((user) => ({ id: String(user._id), full_name: (user.full_name as string).trim(), technician_type: normalizeTechnicianType(user.technician_type) }))
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
