"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import StatCards from "@/components/StatCards";
import LoadCards from "@/components/LoadCards";
import GaugeCardList from "@/components/GaugeCardList";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
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

  const todayStr = new Date().toLocaleDateString("tr-TR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "";

  if (loading) {
    return (
      <div>
        <TopBar title="Avcıkoru Santrali Motor Bakım Merkezi" subtitle="Bakım Merkezi" />
        <div className="px-4 py-4">
          <Skeleton className="h-32 w-full rounded-card mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-40 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-56 mb-3" />
          <div className="flex flex-col gap-2 mb-4">
            <Skeleton className="h-10 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-full" />
          </div>
          <div className="flex flex-col md:grid md:grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Avcıkoru Santrali Motor Bakım Merkezi" subtitle={todayStr} />
      <div className="px-4 py-4">
        {/* ✨ Karşılama Kartı */}
        <div className="bg-gradient-to-br from-amber/15 via-panel to-panel border border-amber/20 rounded-card p-4 mb-4 animate-fade-in">
          <div className="text-[15px] font-bold text-text">
            {greeting()}{firstName ? `, ${firstName}` : ""} 👋
          </div>
          <div className="text-[11px] text-muted mt-0.5">Motor bakım durumuna hızlı bir bakış at.</div>

          {counts.gecikmis > 0 ? (
            <div className="mt-2 text-[11.5px] text-red font-semibold">
              ⏰ {counts.gecikmis} bakım gecikmiş durumda — hemen göz at!
            </div>
          ) : counts.kritik > 0 ? (
            <div className="mt-2 text-[11.5px] text-orange font-semibold">
              ⚠️ {counts.kritik} bakım kritik seviyede.
            </div>
          ) : (
            <div className="mt-2 text-[11.5px] text-green font-semibold">
              ✅ Tüm bakımlar yolunda görünüyor.
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Link
              href="/tamamla"
              className="flex-1 py-2 rounded-lg bg-amber text-[#161006] text-[11.5px] font-extrabold text-center hover:brightness-110 active:scale-[.98] transition"
            >
              ✅ Bakım Tamamla
            </Link>
            <Link
              href="/saat-guncelle"
              className="flex-1 py-2 rounded-lg border border-border text-muted text-[11.5px] font-bold text-center hover:bg-panel2 transition"
            >
              🕒 Saat Güncelle
            </Link>
          </div>
        </div>

        {counts.gecikmis > 0 && (
          <div className="bg-red/10 border border-red/40 rounded-card p-4 mb-4 flex items-center gap-3 animate-fade-in">
            <span className="text-2xl">🚨</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-red">{counts.gecikmis} bakım gecikmiş durumda!</div>
              <div className="text-[11px] text-muted mt-0.5">Gecikmiş bakımlar motor ömrünü kısaltır, hemen planlayın.</div>
            </div>
            <button
              onClick={() => { setStatusFilter("Gecikmiş"); setTypeFilter("Tümü"); }}
              className="flex-shrink-0 px-3 py-2 rounded-lg bg-red text-white text-[11px] font-extrabold hover:brightness-110 transition"
            >
              Görüntüle
            </button>
          </div>
        )}

        <StatCards counts={counts} />

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor Yükleri</h2>
        <div className="flex gap-4 text-xs text-muted mb-2">
          <span>Toplam <b className="text-text font-mono">{totalLoad.toLocaleString("tr-TR")}</b> kW</span>
          <span>Ort. <b className="text-text font-mono">{avgLoad.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</b> kW</span>
        </div>
        <LoadCards engines={sortedEngines} />

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Bakım Türüne Göre Görüntüle</h2>

        {/* Bakım türü çipleri — PC'de sarılır, mobilde kaydırma yok */}
        <div className="flex flex-wrap gap-2 mb-3">
          {typeOptions.map((option) => (
            <button
              key={option}
              onClick={() => setTypeFilter(option)}
              className={`px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${
                typeFilter === option
                  ? "bg-amber text-[#161006] shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Durum çipleri — PC'de sarılır, mobilde kaydırma yok */}
        <div className="flex flex-wrap gap-2 mb-4">
          {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((option) => (
            <button
              key={option}
              onClick={() => setStatusFilter(option)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                statusFilter === option
                  ? "bg-teal text-[#06181b] shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {cardRows.length > 0 && (
          <div className="text-[11px] text-muted mb-2">
            <b className="text-text">{cardRows.length}</b> bakım kaydı gösteriliyor
          </div>
        )}

        <GaugeCardList rows={cardRows} />

        {cardRows.length === 0 && (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-muted">Seçili filtrelere uygun bakım kaydı bulunamadı.</p>
            <button
              onClick={() => { setTypeFilter("Tümü"); setStatusFilter("Tümü"); }}
              className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel transition"
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
