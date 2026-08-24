"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";
import { canAccessRoute } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { MaintenancePanelResponse } from "@/lib/maintenancePanel";

interface MenuItem {
  href: string;
  label: string;
  icon: string;
}

const ADMIN_VIEWER_ITEMS: MenuItem[] = [
  { href: "/dashboard", label: "Özet", icon: "📊" },
  { href: "/tamamla", label: "Bakım Tamamlama", icon: "✅" },
  { href: "/kayitlar", label: "Bakım Kayıtları", icon: "📋" },
  { href: "/motorlar", label: "Motorlar", icon: "⚙️" },
  { href: "/bakim-turleri", label: "Bakım Türleri", icon: "🔧" },
  { href: "/istatistik", label: "İstatistikler", icon: "📈" },
  { href: "/asistan", label: "Bakım Asistanı", icon: "✦" },
  { href: "/diger", label: "Diğer Menüler", icon: "☰" },
];

const TECHNICIAN_ITEMS: MenuItem[] = [
  { href: "/tamamla", label: "Bakım Tamamla", icon: "✅" },
  { href: "/kayitlar", label: "Bakım Kayıtları", icon: "📋" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [gecikmis, setGecikmis] = useState<number>(0);
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
      toast.dismiss(loadingToast);
      toast.success("Güvenli çıkış yapıldı 👋");
      router.push("/login");
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Çıkış yapılamadı.");
    }
  }

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-[#0f1319]/95 backdrop-blur-xl border-r border-border flex-col z-40">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#232d3a] to-panel border border-border flex items-center justify-center text-xl shadow-lg">
            🔧
          </div>
          <div>
            <div className="font-display text-lg font-bold uppercase tracking-wide leading-tight">
              Avcıkoru <span className="text-amber">Santrali</span>
            </div>
            <div className="text-[10px] text-faint">Bakım Merkezi</div>
          </div>
        </div>
      </div>

      {/* Menü */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">Ana Menü</div>
        <div className="flex flex-col gap-0.5">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const isOtherMenu = !isTechnicianAccount && item.href === "/diger";
            return (
              <div key={item.href} className={isOtherMenu ? "mt-3 border-t border-border pt-3" : ""}>
                {isOtherMenu && <div className="px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">Diğer</div>}
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-all ${
                    active
                      ? "border-amber/20 bg-amber/10 text-amber"
                      : isOtherMenu
                        ? "border-border bg-panel2/40 text-muted hover:border-amber/30 hover:bg-panel hover:text-text"
                        : "border-transparent text-muted hover:bg-panel hover:text-text"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="relative flex-shrink-0 text-base">
                    {item.icon}
                    {item.href === "/dashboard" && gecikmis > 0 && (
                      <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[15px] items-center justify-center rounded-full bg-red px-1 text-[8px] font-bold text-white">
                        {gecikmis}
                      </span>
                    )}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber" />}
                  {isOtherMenu && !active && <span className="ml-auto text-sm text-faint">→</span>}
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
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-muted hover:text-red hover:bg-red/10 border border-border hover:border-red/30 transition-all"
        >
          <span>🚪</span>
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
