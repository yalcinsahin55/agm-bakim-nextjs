"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";

interface Item { engine_id: string; engine_name: string; type_label: string; status: string; remaining: number; period: number; engine_hours: number; }

const statusLabel: Record<string, string> = { gecikmis: "Gecikmiş", kritik: "Kritik", yaklasiyor: "Yaklaşıyor", normal: "Normal" };
const statusClass: Record<string, string> = { gecikmis: "text-red border-red/30", kritik: "text-orange border-orange/30", yaklasiyor: "text-amber border-amber/30", normal: "text-green border-green/30" };

export default function TakvimPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/maintenance-types/panel").then(async (res) => {
      if (res.status === 401) return router.push("/login");
      const data = await res.json();
      setItems(data.items || []);
      setLoading(false);
    });
  }, [router]);

  const grouped = useMemo(() => [...items].sort((a, b) => a.remaining - b.remaining), [items]);
  const month = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date());

  if (loading) return <><TopBar title="Bakım Takvimi" subtitle="Yükleniyor..." /><div className="p-4"><Skeleton className="h-28 rounded-card" /></div><BottomNav /></>;

  return (
    <div>
      <TopBar title="Bakım Takvimi" subtitle={`${month} · Saat bazlı tahmini plan`} />
      <main className="px-4 py-4">
        <div className="mb-4 rounded-card border border-amber/20 bg-gradient-to-br from-amber/10 via-panel to-panel p-4">
          <div className="text-[13px] font-bold text-text">Yaklaşan bakım planı</div>
          <div className="mt-1 text-[11px] text-muted">Liste, motor çalışma saati ve tanımlı bakım aralıklarına göre sıralanır. Tarihler saat kullanımına bağlı yaklaşık gösterimdir.</div>
        </div>
        <div className="flex flex-col gap-2">
          {grouped.map((item) => {
            const due = item.remaining <= 0 ? "Hemen planla" : `${Math.round(item.remaining).toLocaleString("tr-TR")} saat kaldı`;
            return <article key={`${item.engine_id}-${item.type_label}`} className="rounded-card border border-border bg-panel p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-[13px] font-bold text-text">{item.engine_name}</div><div className="mt-0.5 text-[11px] text-muted">{item.type_label}</div></div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass[item.status] || "text-muted border-border"}`}>{statusLabel[item.status] || item.status}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2"><span className="text-[11px] text-faint">Motor saati: {item.engine_hours.toLocaleString("tr-TR")}</span><strong className="text-[12px] text-text">{due}</strong></div>
            </article>;
          })}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
