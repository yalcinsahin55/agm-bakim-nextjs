"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
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

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Bakım Tarihi Tahmini" subtitle="Günde 24 saat kesintisiz çalıştığı varsayılarak hesaplanan en geç tarih" />
      <div className="px-4 py-4">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4">
          {typeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        <GaugeCardList rows={rows.map((r) => ({
          key: r.engine_id + r.type_key,
          title: r.engine_name,
          subtitle: `${r.type_label} · Kalan ${r.remaining.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} sa · 24 sa/gün varsayımıyla`,
          status: r.status, remaining: r.remaining, period: r.period,
          valueLabel: r.estDateStr, unitLabel: "EN GEÇ BAKIM TARİHİ",
          badgeName: r.engine_name,
        }))} />
      </div>
      <BottomNav />
    </div>
  );
}
