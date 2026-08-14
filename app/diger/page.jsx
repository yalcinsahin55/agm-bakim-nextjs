"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { ROLE_LABELS } from "@/lib/status";

const MENU = [
  { href: "/saat-guncelle", label: "Saat / Yük Güncelle", icon: "⏱️", roles: ["yonetici", "planlamaci"] },
  { href: "/bakim-turleri", label: "Bakım Türleri", icon: "🔧" },
  { href: "/tahmin", label: "Bakım Tarihi Tahmini", icon: "🗓️" },
  { href: "/yag-analizleri", label: "Yağ Analizleri", icon: "🧪" },
  { href: "/karter-basinci", label: "Karter Fark Basıncı", icon: "📉" },
  { href: "/motor-bilgi", label: "Motor Bilgi Kartı", icon: "📋" },
  { href: "/kayitlar", label: "Bakım Kayıtları", icon: "📜" },
  { href: "/saat-gecmisi", label: "Saat Geçmişi", icon: "📈" },
  { href: "/araliklar", label: "Bakım Aralıkları", icon: "📊" },
  { href: "/excel", label: "Excel", icon: "📥" },
  { href: "/kullanicilar", label: "Kullanıcılar", icon: "👥", roles: ["yonetici"] },
  { href: "/bakim-turu-yonetimi", label: "Bakım Türü Yönetimi", icon: "🗑️", roles: ["yonetici"] },
];

export default function DigerPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  const items = MENU.filter((m) => !m.roles || (user && m.roles.includes(user.role)));

  return (
    <div>
      <TopBar title="Diğer" subtitle={user ? `${user.full_name} · ${ROLE_LABELS[user.role]}` : ""} />
      <div className="px-4 py-4 flex flex-col gap-1.5">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 bg-panel border border-border rounded-card p-3.5">
            <span className="text-lg">{item.icon}</span>
            <span className="text-[13.5px] font-semibold text-text flex-1">{item.label}</span>
            <span className="text-faint">›</span>
          </Link>
        ))}

        <button onClick={logout} className="mt-3 py-3 rounded-xl border border-border text-red font-bold text-[13.5px]">
          Çıkış Yap
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
