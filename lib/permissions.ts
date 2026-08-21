import type { Role } from "./types";

export type Permission =
  | "users:read"
  | "users:write"
  | "maintenance:read"
  | "maintenance:write"
  | "reports:read";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  yonetici: ["users:read", "users:write", "maintenance:read", "maintenance:write", "reports:read"],
  planlamaci: ["maintenance:read", "maintenance:write", "reports:read"],
  teknisyen: ["maintenance:read", "maintenance:write", "reports:read"],
  goruntuleyici: ["maintenance:read", "reports:read"],
};

export function hasPermission(role: Role | string | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role as Role].includes(permission);
}

export function canManageUsers(role: Role | string | undefined): boolean {
  return hasPermission(role, "users:write");
}

export function canWriteMaintenance(role: Role | string | undefined): boolean {
  return hasPermission(role, "maintenance:write");
}

export const ROLE_LABELS: Record<Role, string> = {
  yonetici: "Yönetici",
  planlamaci: "Planlamacı",
  teknisyen: "Teknisyen",
  goruntuleyici: "Görüntüleyici",
};
