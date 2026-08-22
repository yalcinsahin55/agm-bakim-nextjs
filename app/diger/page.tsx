"use client";

import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";

const GROUPS = [
  {
    title: "Bakım İşlemleri",
    items: [
      { href: "/saat-guncelle", icon: "🕒", label: "Saat / Yük Güncelle", desc: "Toplu motor saati ve yük güncelleme" },
      { href: "/bakim-turleri", icon: "🔧", label: "Bakım Türleri", desc: "Tür bazında tüm motorları listele" },
      { href: "/tahmin", icon: "📅", label: "Bakım Tarihi Tahmini", desc: "En geç bakım tarihi tahmini" },
      { href: "/kayitlar", icon: "📋", label: "Bakım Kayıtları", desc: "Listele, filtrele, düzenle, sil" },
      { href: "/bildirimler", icon: "🔔", label: "Bildirimler", desc: "Gecikmiş ve yaklaşan bakımlar" },
      { href: "/takvim", icon: "📅", label: "Bakım Takvimi", desc: "Yaklaşan bakımları planla" },
    ],
  },
  {
    title: "Analiz & Takip",
    items: [
      { href: "/karter-basinci", icon: "📈", label: "Karter Fark Basıncı", desc: "Ölçüm girişi ve geçmiş grafiği" },
      { href: "/saat-gecmisi", icon: "📉", label: "Saat Geçmişi", desc: "Motor bazlı grafik ve tablo" },
      { href: "/yag-analizleri", icon: "🧪", label: "Yağ Analizleri", desc: "Laboratuvar PDF raporları" },
      { href: "/araliklar", icon: "⏱️", label: "Bakım Aralıkları", desc: "Bakımlar arası saat farkı analizi" },
    ],
  },
  {
    title: "Bilgi & Rapor",
    items: [
      { href: "/motor-bilgi", icon: "🛠️", label: "Motor Bilgi Kartı", desc: "Kaver, filtre, eşanjör referansları" },
      { href: "/qr-etiketleri", icon: "▣", label: "QR Etiketleri", desc: "Motor QR kodlarını yazdır ve PDF al" },
      { href: "/excel", icon: "📊", label: "Excel", desc: "Çok sayfalı rapor ve içe aktarma" },
      { href: "/rapor", icon: "📄", label: "Motor Bakım Raporu", desc: "Yazdırılabilir bakım geçmişi raporu" },
      { href: "/istatistik", icon: "📈", label: "İstatistikler", desc: "Aylık bakım istatistikleri" },
    ],
  },
  {
    title: "Yönetim",
    admin: true,
    items: [
      { href: "/kullanicilar", icon: "👥", label: "Kullanıcılar", desc: "Kullanıcı ekle, rol değiştir" },
      { href: "/bakim-turu-yonetimi", icon: "⚙️", label: "Bakım Türü Yönetimi", desc: "Tür ekle, düzenle, sil" },
      { href: "/audit-log", icon: "🧾", label: "İşlem Geçmişi", desc: "Kullanıcı ve veri değişiklikleri" },
      { href: "/yedekleme", icon: "💾", label: "Yedekleme", desc: "Güvenli JSON veri dışa aktarma" },
    ],
  },
];

export default function DigerPage() {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "yonetici";

  return (
    <div>
      <TopBar title="Diğer Menüler" subtitle="Tüm modüllere hızlı erişim" />
      <div className="px-4 py-4 flex flex-col gap-2">
        {GROUPS.filter((g) => !g.admin || isAdmin).map((group) => (
          <section key={group.title}>
            <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-4 mb-3 border-b border-border pb-2">
              {group.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 bg-panel border border-border rounded-card p-3.5 hover:border-borderlt hover:-translate-y-0.5 transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-panel2 border border-border flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-text truncate">{item.label}</div>
                    <div className="text-[10.5px] text-faint mt-0.5 truncate">{item.desc}</div>
                  </div>
                  <span className="text-faint group-hover:text-amber group-hover:translate-x-1 transition-all">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
