"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";
import { notifyAuthChanged } from "@/lib/authClient";
import { canAccessRoute } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { MaintenancePanelResponse } from "@/lib/maintenancePanel";
import AppIcon, { type AppIconName } from "@/components/ui/AppIcon";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";

interface MenuItem {
  href: string;
  label: string;
  icon: AppIconName;
}

const ADMIN_VIEWER_ITEMS: MenuItem[] = [
  { href: "/dashboard", label: "Özet", icon: "dashboard" },
  { href: "/tamamla", label: "Bakım Tamamlama", icon: "check" },
  { href: "/kayitlar", label: "Bakım Kayıtları", icon: "records" },
  { href: "/motorlar", label: "Motorlar", icon: "engine" },
  { href: "/bakim-turleri", label: "Bakım Türleri", icon: "tool" },
  { href: "/istatistik", label: "İstatistikler", icon: "chart" },
  { href: "/asistan", label: "Bakım Asistanı", icon: "assistant" },
  { href: "/diger", label: "Diğer Menüler", icon: "menu" },
];

const TECHNICIAN_ITEMS: MenuItem[] = [
  { href: "/tamamla", label: "Bakım Tamamla", icon: "check" },
  { href: "/kayitlar", label: "Bakım Kayıtları", icon: "records" },
  { href: "/hesap", label: "Hesap ve Şifre", icon: "lock" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [gecikmis, setGecikmis] = useState<number>(0);
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const { user } = useCurrentUser();
  const isTechnicianAccount = user?.role === "teknisyen" || user?.role === "planlamaci";
  const visibleItems = (isTechnicianAccount ? TECHNICIAN_ITEMS : ADMIN_VIEWER_ITEMS).filter((item) => canAccessRoute(user?.role, item.href));

  useEffect(() => {
    let alive = true;
    cachedFetch<MaintenancePanelResponse>("/api/maintenance-types/panel", 30000)
      .then((data) => {
        if (!alive) return;
        setGecikmis(data.items.filter((item) => item.status === "gecikmis").length);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  async function handleLogout() {
    const loadingToast = toast.loading("Çıkış yapılıyor...");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      invalidateCachedFetch("/api/auth/me");
      notifyAuthChanged();
      toast.dismiss(loadingToast);
      toast.success("Güvenli çıkış yapıldı 👋");
      router.push("/login");
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Çıkış yapılamadı.");
    }
  }

  return (
    <aside data-collapsed={collapsed} className={`fixed bottom-0 left-0 top-0 z-40 hidden flex-col border-r border-border bg-bg/95 backdrop-blur-xl transition-[width] duration-200 md:flex ${collapsed ? "w-[76px]" : "w-64"}`}>
      {/* Logo */}
      <div className={`border-b border-border px-3 pb-4 pt-5 ${collapsed ? "flex flex-col items-center gap-3" : ""}`}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-border shadow-lg">
            <Image src="/app-icon.png" alt="Avcıkoru Bakım" fill sizes="44px" className="object-cover" loading="lazy" />
          </div>
          <div className={collapsed ? "hidden" : "min-w-0"}>
            <div className="font-display text-lg font-bold uppercase tracking-wide leading-tight">
              Avcıkoru <span className="text-amber">Santrali</span>
            </div>
            <div className="text-[10px] text-faint">Bakım Merkezi</div>
          </div>
        </div>
        <button type="button" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"} title={collapsed ? "Genişlet" : "Daralt"} className={`mt-3 flex h-8 items-center justify-center rounded-lg border border-border bg-panel2 text-muted transition hover:border-amber/50 hover:text-amber ${collapsed ? "w-10" : "w-full"}`}>
          <AppIcon name="menu" size={15} />
          {!collapsed && <span className="ml-2 text-[10px] font-bold">Menüyü daralt</span>}
        </button>
      </div>

      {/* Menü */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className={`px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-faint ${collapsed ? "hidden" : ""}`}>Ana Menü</div>
        <div className="flex flex-col gap-0.5">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const isOtherMenu = !isTechnicianAccount && item.href === "/diger";
            return (
              <div key={item.href} className={isOtherMenu ? "mt-3 border-t border-border pt-3" : ""}>
                {isOtherMenu && <div className={`px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-faint ${collapsed ? "hidden" : ""}`}>Diğer</div>}
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`relative flex items-center gap-3 rounded-lg border py-2.5 text-[13px] font-medium transition-all ${collapsed ? "justify-center px-2" : "px-3"} ${
                    active
                      ? "border-amber/20 bg-amber/10 text-amber"
                      : isOtherMenu
                        ? "border-border bg-panel2/40 text-muted hover:border-amber/30 hover:bg-panel hover:text-text"
                        : "border-transparent text-muted hover:bg-panel hover:text-text"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center"><AppIcon name={item.icon} size={17} /></span>
                  <span className={`truncate ${collapsed ? "hidden" : ""}`}>{item.label}</span>
                  <span className={`ml-auto flex items-center gap-2 ${collapsed ? "hidden" : ""}`}>
                    {item.href === "/dashboard" && gecikmis > 0 && (
                      <span
                        title={`${gecikmis} gecikmiş bakım`}
                        aria-label={`${gecikmis} gecikmiş bakım`}
                        className="whitespace-nowrap rounded-full border border-red/35 bg-red/15 px-1.5 py-0.5 text-[9px] font-bold text-red"
                      >
                        {gecikmis} gecikmiş
                      </span>
                    )}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
                    {isOtherMenu && !active && <span className="text-sm text-faint">→</span>}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Çıkış */}
      <div className="shrink-0 p-3 border-t border-border">
        <button
          onClick={handleLogout}
          title={collapsed ? "Çıkış Yap" : undefined}
          className={`flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[12px] font-semibold text-muted transition-all hover:border-red/30 hover:bg-red/10 hover:text-red ${collapsed ? "w-10" : "w-full"}`}
        >
              <AppIcon name="logout" size={16} />
          {!collapsed && "Çıkış Yap"}
        </button>
      </div>
    </aside>
  );
}
