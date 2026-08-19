"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import StatCards from "@/components/StatCards";
import LoadCards from "@/components/LoadCards";
import GaugeCardList from "@/components/GaugeCardList";
import Skeleton from "@/components/Skeleton";
import { engineSortKey } from "@/lib/status";

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [statusFilter, setStatusFilter] = useState("Tümü");

  useEffect(() => {
    fetch("/api/maintenance-types/panel").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setItems(data.items);
      setEngines(data.engines);
      setLoading(false);
    });
  }, [router]);

  const counts = useMemo(() => {
    const c = { gecikmis: 0, kritik: 0, yaklasiyor: 0, normal: 0 };
    items.forEach((i) => { c[i.status]++; });
    return c;
  }, [items]);

  const typeOptions = useMemo(() => {
    const labels = Array.from(new Set(items.map((i) => i.type_label))).sort();
    return ["Tümü", ...labels];
  }, [items]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const totalLoad = sortedEngines.reduce((s, e) => s + (e.load_kw || 0), 0);
  const avgLoad = sortedEngines.length ? totalLoad / sortedEngines.length : 0;

  const statusMap = { "Gecikmiş": "gecikmis", "Kritik": "kritik", "Yaklaşıyor": "yaklasiyor", "Normal": "normal" };
  const filteredRows = useMemo(() => {
    let rows = items;
    if (typeFilter !== "Tümü") rows = rows.filter((i) => i.type_label === typeFilter);
    if (statusFilter !== "Tümü") rows = rows.filter((i) => i.status === statusMap[statusFilter]);
    return [...rows].sort((a, b) => a.remaining - b.remaining);
  }, [items, typeFilter, statusFilter]);

  const cardRows = filteredRows.map((r) => ({
    key: r.engine_id + r.type_key,
    title: r.engine_name,
    subtitle: `${r.type_label} · ${r.engine_hours.toLocaleString("tr-TR")} sa · Çalışılan ${(r.engine_hours - r.last_hour).toLocaleString("tr-TR")} sa`,
    status: r.status, remaining: r.remaining, period: r.period,
    valueLabel: (r.remaining <= 0 ? "+" : "") + Math.abs(Math.round(r.remaining)).toLocaleString("tr-TR"),
    unitLabel: r.remaining <= 0 ? "SAAT GECİKME" : "SAAT KALDI",
    badgeName: r.engine_name,
  }));

  // ✨ YENİ: Modern Skeleton Yükleme Ekranı
  if (loading) {
    return (
      <div>
        <TopBar title="AGM Motor Bakım Merkezi" subtitle="Bakım Merkezi" />
        <div className="px-4 py-4">
          {/* Stat Cards İskeleti */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>

          {/* Motor Yükleri Başlığı */}
          <Skeleton className="h-6 w-40 mb-3" />
          <div className="flex gap-4 mb-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          
          {/* Load Cards İskeleti */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>

          {/* Filtreler Başlığı */}
          <Skeleton className="h-6 w-56 mb-3" />
          <div className="flex flex-col gap-2 mb-4">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Gauge Cards İskeleti */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="AGM Motor Bakım Merkezi" subtitle="Bakım Merkezi" />
      <div className="px-4 py-4">
        <StatCards counts={counts} />

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor Yükleri</h2>
        <div className="flex gap-4 text-xs text-muted mb-2">
          <span>Toplam <b className="text-text font-mono">{totalLoad.toLocaleString("tr-TR")}</b> kW</span>
          <span>Ort. <b className="text-text font-mono">{avgLoad.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</b> kW</span>
        </div>
        <LoadCards engines={sortedEngines} />

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Bakım Türüne Göre Görüntüle</h2>
        
        {/* ✨ YENİ: Modern Filtre Butonları (Dropdown yerine chip/pill butonlar) */}
        <div className="mb-3">
          <label className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2 block">Bakım Türü</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {typeOptions.map((option) => (
              <button
                key={option}
                onClick={() => setTypeFilter(option)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  typeFilter === option
                    ? "bg-amber text-white shadow-lg"
                    : "bg-panel2 text-muted hover:bg-panel border border-border"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2 block">Durum</label>
          <div className="flex flex-wrap gap-2">
            {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((option) => (
              <button
                key={option}
                onClick={() => setStatusFilter(option)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  statusFilter === option
                    ? "bg-teal text-white shadow-lg"
                    : "bg-panel2 text-muted hover:bg-panel border border-border"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Sonuç Sayacı */}
        {cardRows.length > 0 && (
          <div className="text-[11px] text-muted mb-2">
            <b className="text-text">{cardRows.length}</b> bakım kaydı gösteriliyor
          </div>
        )}

        <GaugeCardList rows={cardRows} />

        {/* Boş Durum Mesajı */}
        {cardRows.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-muted">Seçili filtrelere uygun bakım kaydı bulunamadı.</p>
            <button
              onClick={() => { setTypeFilter("Tümü"); setStatusFilter("Tümü"); }}
              className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel"
            >
              Filtreleri Temizle
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
