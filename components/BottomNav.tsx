"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";
import { notifyAuthChanged } from "@/lib/authClient";
import { canAccessRoute } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { triggerHaptic } from "@/lib/haptics";
import type { MaintenancePanelResponse } from "@/lib/maintenancePanel";
import AppIcon, { type AppIconName } from "@/components/ui/AppIcon";
interface MenuItem {
  href: string;
  label: string;
  icon: AppIconName;
}

const ITEMS: MenuItem[] = [
  { href: "/dashboard", label: "Özet", icon: "dashboard" },
  { href: "/motorlar", label: "Motorlar", icon: "engine" },
  { href: "/tamamla", label: "Tamamla", icon: "check" },
  { href: "/diger", label: "Diğer", icon: "menu" },
];

const TECHNICIAN_ITEMS: MenuItem[] = [
  { href: "/tamamla", label: "Tamamla", icon: "check" },
  { href: "/kayitlar", label: "Kayıtlar", icon: "records" },
  { href: "/hesap", label: "Şifre", icon: "lock" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [gecikmis, setGecikmis] = useState<number>(0);
  const [hiddenOnScroll, setHiddenOnScroll] = useState(false);
  const { user } = useCurrentUser();
  const keyboardOpen = useKeyboardOpen();
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

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      const currentY = window.scrollY;
      if (currentY < 80) setHiddenOnScroll(false);
      else if (currentY - lastY > 8) setHiddenOnScroll(true);
      else if (lastY - currentY > 8) setHiddenOnScroll(false);
      lastY = currentY;
      frame = 0;
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  async function handleLogout() {
    const loadingToast = toast.loading("Çıkış yapılıyor...");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      invalidateCachedFetch("/api/auth/me");
      notifyAuthChanged();
      toast.dismiss(loadingToast);
      toast.success("Güvenli çıkış yapıldı ");
      router.push("/login");
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Çıkış yapılamadı.");
    }
  }

  return (
    <>
      <div className="h-24 md:hidden" aria-hidden="true" />
      <div className={`fixed bottom-0 left-0 right-0 z-30 pb-safe transition-transform duration-200 md:hidden ${hiddenOnScroll || keyboardOpen ? "mobile-nav-hidden" : ""}`}>
        <nav aria-label="Mobil ana navigasyon" className="mx-auto flex min-h-20 w-full max-w-lg min-w-0 items-stretch border-t border-border bg-bg/98 px-1 pb-3 pt-2 shadow-[0_-8px_28px_rgba(15,19,25,0.12)] backdrop-blur-xl">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href === "/diger" && pathname.startsWith("/diger"));
            return (
              <Link
                key={item.href} href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-control px-0 py-1 text-center transition ${active ? "text-amber" : "text-faint hover:text-muted"}`}
              >
                <span className="relative flex h-6 items-center justify-center leading-none">
                  <AppIcon name={item.icon} size={20} className={`transition-transform duration-150 ${active ? "-translate-y-0.5" : ""}`} />
                  {item.href === "/dashboard" && gecikmis > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[9px] font-bold flex items-center justify-center shadow">
                      {gecikmis}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-[9.5px] font-bold">{item.label}</span>
                <span className={`absolute bottom-0 h-0.5 w-6 origin-center rounded-full bg-amber transition-transform duration-200 ${active ? "scale-x-100" : "scale-x-0"}`} />
              </Link>
            );
          })}
          {/* Mobil Çıkış */}
          <button
            onClick={handleLogout}
            onPointerDown={() => triggerHaptic("light")}
            aria-label="Çıkış Yap"
            className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-control px-0 py-1 text-center text-faint transition hover:text-red"
          >
            <span className="flex h-6 items-center justify-center"><AppIcon name="logout" size={20} /></span>
            <span className="max-w-full truncate text-[9.5px] font-bold">Çıkış</span>
          </button>
        </nav>
      </div>
    </>
  );
}
