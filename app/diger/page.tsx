"use client";

import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { canAccessRoute, isAdmin } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import AppIcon, { type AppIconName } from "@/components/ui/AppIcon";

const GROUPS: Array<{ title: string; admin?: boolean; items: Array<{ href: string; icon: AppIconName; label: string; desc: string }> }> = [
  {
    title: "Bakım İşlemleri",
    items: [
      { href: "/saat-guncelle", icon: "gauge", label: "Saat / Yük Güncelle", desc: "Toplu motor saati ve yük güncelleme" },
      { href: "/bakim-turleri", icon: "tool", label: "Bakım Türleri", desc: "Tür bazında tüm motorları listele" },
      { href: "/tahmin", icon: "hourglass", label: "Bakım Tarihi Tahmini", desc: "En geç bakım tarihi tahmini" },
      { href: "/kayitlar", icon: "records", label: "Bakım Kayıtları", desc: "Listele, filtrele, düzenle, sil" },
      { href: "/bildirimler", icon: "bell", label: "Bildirimler", desc: "Gecikmiş ve yaklaşan bakımlar" },
      { href: "/takvim", icon: "calendar", label: "Bakım Takvimi", desc: "Yaklaşan bakımları planla" },
    ],
  },
  {
    title: "Analiz & Takip",
    items: [
      { href: "/karter-basinci", icon: "gauge", label: "Karter Fark Basıncı", desc: "Ölçüm girişi ve geçmiş grafiği" },
      { href: "/saat-gecmisi", icon: "chart", label: "Saat Geçmişi", desc: "Motor bazlı grafik ve tablo" },
      { href: "/bakim-trendleri", icon: "chart", label: "Bakım Trendleri", desc: "Bakım süresi, sıklığı ve tür analizi" },
      { href: "/yag-analizleri", icon: "flask", label: "Yağ Analizleri", desc: "Laboratuvar PDF raporları" },
      { href: "/araliklar", icon: "clock", label: "Bakım Aralıkları", desc: "Bakımlar arası saat farkı analizi" },
    ],
  },
  {
    title: "Bilgi & Rapor",
    items: [
      { href: "/motor-bilgi", icon: "engine", label: "Motor Bilgi Kartı", desc: "Kaver, filtre, eşanjör referansları" },
      { href: "/qr-etiketleri", icon: "qr", label: "QR Etiketleri", desc: "Motor veya bakım türü QR kodlarını yazdır" },
      { href: "/excel", icon: "file", label: "Excel", desc: "Çok sayfalı rapor ve içe aktarma" },
      { href: "/rapor", icon: "file", label: "Motor Bakım Raporu", desc: "Yazdırılabilir bakım geçmişi raporu" },
      { href: "/istatistik", icon: "chart", label: "İstatistikler", desc: "Aylık bakım istatistikleri" },
      { href: "/teknisyen-raporu", icon: "users", label: "Teknisyen Raporu", desc: "Ekip performansı ve çalışma süreleri" },
      { href: "/asistan", icon: "assistant", label: "Bakım Asistanı", desc: "Salt okunur rapor ve bakım özeti" },
    ],
  },
  {
    title: "Hesap",
    items: [
      { href: "/hesap", icon: "lock", label: "Hesap ve Şifre", desc: "Şifrenizi güvenle değiştirin" },
    ],
  },
  {
    title: "Yönetim",
    admin: true,
    items: [
      { href: "/kullanicilar", icon: "users", label: "Kullanıcılar", desc: "Kullanıcı ekle, rol değiştir" },
      { href: "/teknisyen-yetkilendirme", icon: "shield", label: "Teknisyen Yetkilendirme", desc: "Uzmanlık ve görev izinlerini yönet" },
      { href: "/bakim-turu-yonetimi", icon: "tool", label: "Bakım Türü Yönetimi", desc: "Tür ekle, düzenle, sil" },
      { href: "/audit-log", icon: "database", label: "İşlem Geçmişi", desc: "Kullanıcı ve veri değişiklikleri" },
      { href: "/veri-kalitesi", icon: "check", label: "Veri Kalitesi", desc: "Motor, bakım ve saat verisi kontrolleri" },
      { href: "/yedekleme", icon: "download", label: "Yedekleme", desc: "Güvenli JSON veri dışa aktarma" },
    ],
  },
];

export default function DigerPage() {
  const { user } = useCurrentUser();
  const admin = isAdmin(user?.role);

  return (
    <div>
      <TopBar title="Diğer Menüler" subtitle="Rolünüze uygun modüller" />
      <div className="px-4 py-4 flex flex-col gap-2">
        {GROUPS.map((group) => {
          const items = group.admin
            ? (admin ? group.items : [])
            : group.items.filter((item) => canAccessRoute(user?.role, item.href));
          if (items.length === 0) return null;

          return (
            <section key={group.title}>
              <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-4 mb-3 border-b border-border pb-2">
                {group.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 bg-panel border border-border rounded-card p-3.5 hover:border-borderlt hover:-translate-y-0.5 transition-all"
                  >
                    <div className="w-11 h-11 rounded-control bg-panel2 border border-border flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                      <AppIcon name={item.icon} size={21} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-text truncate">{item.label}</div>
                      <div className="text-[10.5px] text-faint mt-0.5 truncate">{item.desc}</div>
                    </div>
                    <AppIcon name="arrowUp" size={15} className="rotate-90 text-faint transition-all group-hover:translate-x-1 group-hover:text-amber" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
