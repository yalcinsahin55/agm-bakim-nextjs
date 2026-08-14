"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import StatCards from "@/components/StatCards";
import LoadCards from "@/components/LoadCards";
import GaugeCardList from "@/components/GaugeCardList";
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

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

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
        <div className="flex flex-col gap-2 mb-3">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm">
            {typeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm">
            {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <GaugeCardList rows={cardRows} />
      </div>
      <BottomNav />
    </div>
  );
}
