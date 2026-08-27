import type { Role } from "./types";

export type Permission =
  | "users:read"
  | "users:write"
  | "maintenance:read"
  | "maintenance:write"
  | "reports:read"
  | "assistant:read";

/** Yeni hesaplarda kullanılacak üç rol. `planlamaci` yalnızca eski kayıtlarla uyumluluk için tutulur. */
export const ROLE_OPTIONS = ["yonetici", "teknisyen", "goruntuleyici"] as const;
export type AssignableRole = (typeof ROLE_OPTIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  yonetici: ["users:read", "users:write", "maintenance:read", "maintenance:write", "reports:read", "assistant:read"],
  // Eski planlamacı kayıtları, geçiş süresince teknisyen erişiminde çalışır.
  planlamaci: ["maintenance:read", "maintenance:write"],
  teknisyen: ["maintenance:read", "maintenance:write"],
  goruntuleyici: ["maintenance:read", "reports:read", "assistant:read"],
};

export function normalizeRole(role: Role | string | undefined): AssignableRole | null {
  if (role === "planlamaci") return "teknisyen";
  if (role === "yonetici" || role === "teknisyen" || role === "goruntuleyici") return role;
  return null;
}

export function hasPermission(role: Role | string | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role as Role].includes(permission);
}

export function isAdmin(role: Role | string | undefined): boolean {
  return normalizeRole(role) === "yonetici";
}

export function canManageUsers(role: Role | string | undefined): boolean {
  return isAdmin(role);
}

export function canWriteMaintenance(role: Role | string | undefined): boolean {
  return hasPermission(role, "maintenance:write");
}

const TECHNICIAN_ROUTES = [
  "/tamamla",
  "/kayitlar",
  "/hesap",
];

export function defaultRouteForRole(role: Role | string | undefined): string {
  const normalized = normalizeRole(role);
  if (normalized === "teknisyen") return "/tamamla";
  if (normalized === "yonetici" || normalized === "goruntuleyici") return "/dashboard";
  return "/dashboard";
}

const VIEWER_ROUTES = [
  "/dashboard",
  "/hesap",
  "/motorlar",
  "/kayitlar",
  "/diger",
  "/karter-basinci",
  "/saat-gecmisi",
  "/yag-analizleri",
  "/araliklar",
  "/motor-bilgi",
  "/qr-etiketleri",
  "/excel",
  "/rapor",
  "/istatistik",
  "/teknisyen-raporu",
  "/asistan",
  "/bakim-turleri",
  "/tahmin",
];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Sayfa görünürlüğünün tek kaynağı; API yetkileri yine sunucuda ayrıca doğrulanır. */
export function canAccessRoute(role: Role | string | undefined, pathname: string): boolean {
  const normalized = normalizeRole(role);
  if (normalized === "yonetici") return true;
  const routes = normalized === "teknisyen" ? TECHNICIAN_ROUTES : normalized === "goruntuleyici" ? VIEWER_ROUTES : [];
  return routes.some((route) => matchesRoute(pathname, route));
}

export const ROLE_LABELS: Record<Role, string> = {
  yonetici: "Yönetici",
  planlamaci: "Teknisyen (eski Planlamacı)",
  teknisyen: "Teknisyen",
  goruntuleyici: "Görüntüleyici",
};
