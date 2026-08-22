"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";

interface MenuItem {
  href: string;
  label: string;
  icon: string;
}

const ITEMS: MenuItem[] = [
  { href: "/dashboard", label: "Özet", icon: "📊" },
  { href: "/motorlar", label: "Motorlar", icon: "⚙️" },
  { href: "/tamamla", label: "Bakım Tamamla", icon: "✅" },
  { href: "/saat-guncelle", label: "Saat Güncelle", icon: "🕒" },
  { href: "/karter-basinci", label: "Karter Basıncı", icon: "📈" },
  { href: "/saat-gecmisi", label: "Saat Geçmişi", icon: "📉" },
  { href: "/yag-analizleri", label: "Yağ Analizleri", icon: "🧪" },
  { href: "/kayitlar", label: "Bakım Kayıtları", icon: "📋" },
  { href: "/diger", label: "Diğer Menüler", icon: "☰" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [gecikmis, setGecikmis] = useState<number>(0);

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
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="text-[9px] font-bold text-faint uppercase tracking-wider px-2 mb-2">Ana Menü</div>
        <div className="flex flex-col gap-0.5">
          {ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                  active
                    ? "bg-amber/10 text-amber border border-amber/20"
                    : "text-muted hover:bg-panel hover:text-text border border-transparent"
                }`}
              >
                <span className="text-base flex-shrink-0 relative">
                  {item.icon}
                  {item.href === "/dashboard" && gecikmis > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[15px] h-3.5 px-1 rounded-full bg-red text-white text-[8px] font-bold flex items-center justify-center">
                      {gecikmis}
                    </span>
                  )}
                </span>
                <span className="truncate">{item.label}</span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Çıkış */}
      <div className="p-3 border-t border-border">
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
