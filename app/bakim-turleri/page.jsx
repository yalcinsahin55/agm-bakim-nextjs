"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
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

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Bakım Türleri" />
      <div className="px-4 py-4">
        <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2">
          {sortedTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4">
          {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

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
      <BottomNav />
    </div>
  );
}
