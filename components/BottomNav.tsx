"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";
import { canAccessRoute } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";

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

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [gecikmis, setGecikmis] = useState<number>(0);
  const { user } = useCurrentUser();

  useEffect(() => {
    let alive = true;
    cachedFetch("/api/maintenance-types/panel", 30000)
      .then((data: any) => {
        if (!data || !alive) return;
        setGecikmis((data.items || []).filter((i: any) => i.status === "gecikmis").length);
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
        <div className="max-w-lg mx-auto bg-[#0f1319]/95 backdrop-blur-xl border-t border-border flex px-1 pt-2 pb-4">
          {ITEMS.filter((item) => canAccessRoute(user?.role, item.href)).map((item) => {
            const active = pathname === item.href || (item.href === "/diger" && pathname.startsWith("/diger"));
            return (
              <Link
                key={item.href} href={item.href}
                className={`relative flex-1 flex flex-col items-center gap-1 rounded-xl py-1 transition ${active ? "text-amber" : "text-faint hover:text-muted"}`}
              >
                <span className="relative text-lg leading-none">
                  {item.icon}
                  {item.href === "/dashboard" && gecikmis > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[9px] font-bold flex items-center justify-center shadow">
                      {gecikmis}
                    </span>
                  )}
                </span>
                <span className="text-[9.5px] font-bold">{item.label}</span>
                {active && <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-amber" />}
              </Link>
            );
          })}
          {/*  Mobil Çıkış */}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center gap-1 rounded-xl py-1 text-faint hover:text-red transition"
          >
            <span className="text-lg leading-none">🚪</span>
            <span className="text-[9.5px] font-bold">Çıkış</span>
          </button>
        </div>
      </div>
    </>
  );
}
