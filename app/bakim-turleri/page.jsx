"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import GaugeCardList from "@/components/GaugeCardList";

export default function BakimTurleriPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");

  useEffect(() => {
    fetch("/api/maintenance-types/panel").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setItems(data.items);
      setTypes(data.types);
      setLoading(false);
      if (data.types.length) setSelectedKey([...data.types].sort((a, b) => a.label.localeCompare(b.label, "tr"))[0].key);
    });
  }, [router]);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.label.localeCompare(b.label, "tr")), [types]);
  const statusMap = { "Gecikmiş": "gecikmis", "Kritik": "kritik", "Yaklaşıyor": "yaklasiyor", "Normal": "normal" };

  const rows = useMemo(() => {
    let list = items.filter((i) => i.type_key === selectedKey);
    if (statusFilter !== "Tümü") list = list.filter((i) => i.status === statusMap[statusFilter]);
    return [...list].sort((a, b) => a.remaining - b.remaining);
  }, [items, selectedKey, statusFilter]);

  const selectedType = types.find((t) => t.key === selectedKey);

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Türleri" />
        <div className="px-4 py-4">
          <div className="flex gap-2 mb-3">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
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
      <TopBar title="Bakım Türleri" subtitle={selectedType ? `${selectedType.label} · ${rows.length} motor` : ""} />
      <div className="px-4 py-4">
        {/* ✨ Bakım türü çipleri (yatay kaydırmalı) */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
          {sortedTypes.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelectedKey(t.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${
                selectedKey === t.key
                  ? "bg-amber text-[#161006] shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ✨ Durum çipleri */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
          {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((o) => (
            <button
              key={o}
              onClick={() => setStatusFilter(o)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                statusFilter === o
                  ? "bg-teal text-[#06181b] shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-sm text-muted">Bu filtre için kayıt bulunamadı.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <GaugeCardList rows={rows.map((r) => ({
              key: r.engine_id,
              title: r.engine_name,
              subtitle: `Motor saati ${r.engine_hours.toLocaleString("tr-TR")} sa · Son bakım ${r.last_hour.toLocaleString("tr-TR")} sa · Çalışılan ${(r.engine_hours - r.last_hour).toLocaleString("tr-TR")} sa`,
              status: r.status, remaining: r.remaining, period: r.period,
              valueLabel: (r.remaining <= 0 ? "+" : "") + Math.abs(Math.round(r.remaining)).toLocaleString("tr-TR"),
              unitLabel: r.remaining <= 0 ? "SAAT GECİKME" : "SAAT KALDI",
              badgeName: r.engine_name,
            }))} />
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
