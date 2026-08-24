"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessRoute, defaultRouteForRole } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";

export default function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { user, loading, error } = useCurrentUser();
  const isPublic = pathname === "/login";
  const allowed = isPublic || canAccessRoute(user?.role, pathname);

  useEffect(() => {
    if (loading || isPublic) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!allowed) router.replace(defaultRouteForRole(user.role));
  }, [allowed, isPublic, loading, router, user]);

  if (isPublic) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="rounded-2xl border border-border bg-panel px-6 py-5 text-sm text-muted">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-border border-t-amber" />
          Yetki kontrol ediliyor...
        </div>
      </div>
    );
  }
  if (!user || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="rounded-2xl border border-border bg-panel px-6 py-5 text-sm text-muted">
          {error || "Bu sayfaya erişim yetkiniz yok. Giriş sayfasına yönlendiriliyorsunuz..."}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
