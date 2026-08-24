import { usersCollection } from "@/lib/dbCollections";
import type { Db } from "mongodb";
import type { TechnicianType, TechnicianPermissions, WorkDomain, User } from "@/lib/types";

export const TECHNICIAN_TYPE_LABELS: Record<TechnicianType, string> = {
  mekanik: "Mekanik teknisyen",
  elektromekanik: "Elektromekanik teknisyen",
};

export const WORK_DOMAIN_LABELS: Record<WorkDomain, string> = {
  mechanical: "Mekanik işler",
  electrical: "Elektriksel işler",
  commissioning: "Devreye alma",
};

const VALID_WORK_DOMAINS: WorkDomain[] = ["mechanical", "electrical", "commissioning"];

export function normalizeWorkDomains(value: unknown, technicianType: TechnicianType): WorkDomain[] {
  if (Array.isArray(value)) {
    const domains = value.filter((domain): domain is WorkDomain => typeof domain === "string" && VALID_WORK_DOMAINS.includes(domain as WorkDomain));
    if (domains.length) return [...new Set(domains)];
  }
  return technicianType === "elektromekanik" ? ["electrical", "commissioning"] : ["mechanical"];
}

export function defaultTechnicianPermissions(technicianType: TechnicianType): TechnicianPermissions {
  return {
    can_be_responsible: technicianType === "mekanik",
    can_be_support: true,
    allowed_work_domains: normalizeWorkDomains(undefined, technicianType),
  };
}

export function normalizeTechnicianPermissions(value: Partial<TechnicianPermissions> | undefined, technicianType: TechnicianType): TechnicianPermissions {
  const defaults = defaultTechnicianPermissions(technicianType);
  return {
    can_be_responsible: typeof value?.can_be_responsible === "boolean" ? value.can_be_responsible : defaults.can_be_responsible,
    can_be_support: typeof value?.can_be_support === "boolean" ? value.can_be_support : defaults.can_be_support,
    allowed_work_domains: normalizeWorkDomains(value?.allowed_work_domains, technicianType),
  };
}

export function canTechnicianWorkOnType(technician: TechnicianOption, type: { work_domains?: WorkDomain[]; allow_electromechanical_support?: boolean; allow_electromechanical_responsible?: boolean }, role: "responsible" | "support"): boolean {
  const permissions = normalizeTechnicianPermissions(technician, technician.technician_type);
  if (role === "responsible" && !permissions.can_be_responsible) return false;
  if (role === "support" && !permissions.can_be_support) return false;
  if (technician.technician_type === "mekanik") return true;
  if (technician.technician_type === "elektromekanik") {
    if (role === "responsible" && type.allow_electromechanical_responsible !== true) return false;
    if (role === "support" && type.allow_electromechanical_support !== true) return false;
  }
  const domains = Array.isArray(type.work_domains) && type.work_domains.length ? type.work_domains : ["mechanical"] as WorkDomain[];
  return permissions.allowed_work_domains.some((domain) => domains.includes(domain));
}

export function normalizeTechnicianType(value: unknown): TechnicianType {
  return value === "elektromekanik" ? "elektromekanik" : "mekanik";
}

export interface TechnicianOption {
  id: string;
  full_name: string;
  technician_type: TechnicianType;
  can_be_responsible: boolean;
  can_be_support: boolean;
  allowed_work_domains: WorkDomain[];
}

export const EXTERNAL_SERVICE_TECHNICIAN_ID = "__external_service__" as const;
export const EXTERNAL_SERVICE_TECHNICIAN_NAME = "Dış Hizmet / Harici Servis";

const TECHNICIAN_ROLES: User["role"][] = ["teknisyen", "planlamaci"];

/** Aynı kişinin büyük-küçük harf, Unicode ve fazla boşluk farklarını tek anahtarda birleştirir. */
export function normalizeTechnicianName(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR")
    : "";
}

const TECHNICIAN_PROJECTION = {
  _id: 1,
  full_name: 1,
  technician_type: 1,
  can_be_responsible: 1,
  can_be_support: 1,
  allowed_work_domains: 1,
};

type TechnicianSource = Pick<User, "_id" | "full_name" | "technician_type" | "can_be_responsible" | "can_be_support" | "allowed_work_domains">;

function toTechnicianOption(user: TechnicianSource): TechnicianOption | null {
  if (user?._id == null || typeof user.full_name !== "string" || !user.full_name.trim()) return null;
  const technician_type = normalizeTechnicianType(user.technician_type);
  const permissions = normalizeTechnicianPermissions(user, technician_type);
  return { id: String(user._id), full_name: user.full_name.trim(), technician_type, ...permissions };
}

export async function listActiveTechnicians(db: Db): Promise<TechnicianOption[]> {
  const users = await usersCollection(db).find(
    {
      role: { $in: TECHNICIAN_ROLES },
      active: { $ne: false },
      approved: { $ne: false },
    },
    { projection: TECHNICIAN_PROJECTION },
  ).toArray();

  return users
    .map(toTechnicianOption)
    .filter((technician): technician is TechnicianOption => technician !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
}

export async function resolveTechnicianOptions(db: Db, ids: unknown): Promise<TechnicianOption[] | null> {
  if (!Array.isArray(ids)) return [];
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (uniqueIds.length > 20) return null;
  if (uniqueIds.length === 0) return [];

  // Kayıt oluşturma/düzenleme sırasında tüm teknisyen listesini tekrar okumak yerine
  // yalnızca gönderilen kimlikleri doğrula; dropdown ekranları listActiveTechnicians kullanır.
  const usersCol = usersCollection(db);
  const users = await usersCol.find(
    {
      _id: { $in: uniqueIds },
      role: { $in: TECHNICIAN_ROLES },
      active: { $ne: false },
      approved: { $ne: false },
    },
    { projection: TECHNICIAN_PROJECTION },
  ).toArray();
  const options: TechnicianOption[] = users
    .map((user) => toTechnicianOption(user))
    .filter((technician: TechnicianOption | null): technician is TechnicianOption => technician !== null);
  const byId = new Map<string, TechnicianOption>(options.map((technician) => [technician.id, technician]));
  if (uniqueIds.some((id) => !byId.has(id))) return null;
  return uniqueIds.map((id) => byId.get(id)!);
}
