"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import GaugeCardList from "@/components/GaugeCardList";

const MAX_DAILY_HOURS = 24;

export default function TahminPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("Tümü");

  useEffect(() => {
    fetch("/api/maintenance-types/panel").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setItems(data.items);
      setLoading(false);
    });
  }, [router]);

  const typeOptions = useMemo(() => ["Tümü", ...Array.from(new Set(items.map((i) => i.type_label))).sort()], [items]);

  const rows = useMemo(() => {
    let list = typeFilter === "Tümü" ? items : items.filter((i) => i.type_label === typeFilter);
    return list
      .map((r) => {
        const daysLeft = r.remaining / MAX_DAILY_HOURS;
        const estDate = new Date();
        estDate.setDate(estDate.getDate() + Math.round(daysLeft));
        return { ...r, daysLeft, estDateStr: estDate.toLocaleDateString("tr-TR") };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [items, typeFilter]);

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Tarihi Tahmini" />
        <div className="px-4 py-4">
          <Skeleton className="h-16 w-full rounded-xl mb-3" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Tarihi Tahmini" subtitle={`${rows.length} kayıt listeleniyor`} />
      <div className="px-4 py-4">
        {/* ✨ Bilgi bandı */}
        <div className="flex items-start gap-2.5 bg-teal/10 border border-teal/30 rounded-xl px-3.5 py-3 mb-3 animate-fade-in">
          <span className="text-lg">💡</span>
          <p className="text-[11.5px] text-muted leading-relaxed">
            Tahminler, motorun <b className="text-teal">günde 24 saat</b> kesintisiz çalıştığı varsayılarak hesaplanan <b>en geç</b> bakım tarihleridir.
          </p>
        </div>

        {/* ✨ Tür çipleri */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
          {typeOptions.map((o) => (
            <button
              key={o}
              onClick={() => setTypeFilter(o)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${
                typeFilter === o
                  ? "bg-amber text-[#161006] shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-sm text-muted">Tahmin için kayıt bulunamadı.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <GaugeCardList rows={rows.map((r) => ({
              key: r.engine_id + r.type_key,
              title: r.engine_name,
              subtitle: `${r.type_label} · Kalan ${r.remaining.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} sa · ~${Math.max(0, Math.round(r.daysLeft))} gün`,
              status: r.status, remaining: r.remaining, period: r.period,
              valueLabel: r.estDateStr, unitLabel: "EN GEÇ BAKIM TARİHİ",
              badgeName: r.engine_name,
            }))} />
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
