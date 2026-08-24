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

const ITEMS: MenuItem[] = [
  { href: "/dashboard", label: "Özet", icon: "📊" },
  { href: "/motorlar", label: "Motorlar", icon: "⚙️" },
  { href: "/tamamla", label: "Tamamla", icon: "✅" },
  { href: "/diger", label: "Diğer", icon: "☰" },
];

const TECHNICIAN_ITEMS: MenuItem[] = [
  { href: "/tamamla", label: "Tamamla", icon: "✅" },
  { href: "/kayitlar", label: "Kayıtlar", icon: "📋" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [gecikmis, setGecikmis] = useState<number>(0);
  const { user } = useCurrentUser();
  const isTechnicianAccount = user?.role === "teknisyen" || user?.role === "planlamaci";
  const visibleItems = (isTechnicianAccount ? TECHNICIAN_ITEMS : ITEMS).filter((item) => canAccessRoute(user?.role, item.href));

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
    <>
      <div className="h-24 md:hidden" aria-hidden="true" />
      <div className="fixed bottom-0 left-0 right-0 z-30 pb-safe md:hidden">
        <div className="mx-auto flex w-full max-w-lg min-w-0 bg-[#0f1319]/95 px-1 pb-4 pt-2 backdrop-blur-xl border-t border-border">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href === "/diger" && pathname.startsWith("/diger"));
            return (
              <Link
                key={item.href} href={item.href}
                className={`relative min-w-0 flex-1 flex flex-col items-center gap-1 rounded-xl px-0 py-1 text-center transition ${active ? "text-amber" : "text-faint hover:text-muted"}`}
              >
                <span className="relative text-lg leading-none">
                  {item.icon}
                  {item.href === "/dashboard" && gecikmis > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[9px] font-bold flex items-center justify-center shadow">
                      {gecikmis}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-[9.5px] font-bold">{item.label}</span>
                {active && <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-amber" />}
              </Link>
            );
          })}
          {/*  Mobil Çıkış */}
          <button
            onClick={handleLogout}
            className="min-w-0 flex-1 flex flex-col items-center gap-1 rounded-xl px-0 py-1 text-center text-faint transition hover:text-red"
          >
            <span className="text-lg leading-none">🚪</span>
            <span className="max-w-full truncate text-[9.5px] font-bold">Çıkış</span>
          </button>
        </div>
      </div>
    </>
  );
}
