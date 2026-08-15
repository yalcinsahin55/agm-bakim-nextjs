"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { engineSortKey } from "@/lib/status";

function MiniLineChart({ points }) {
  if (points.length < 2) return null;
  const w = 300, h = 130, pad = 10;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const path = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="bg-panel border border-border rounded-card">
      <path d={path} fill="none" stroke="#e8952f" strokeWidth="2.5" />
    </svg>
  );
}

export default function SaatGecmisiPage() {
  const router = useRouter();
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    fetch("/api/engines").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setEngines(data);
      setLoading(false);
      if (data.length) setSelected([...data].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name))[0]._id);
    });
  }, [router]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const engine = engines.find((e) => e._id === selected);
  const history = useMemo(() => {
    if (!engine) return [];
    return [...(engine.history || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [engine]);

  const totalDelta = history.length >= 2 ? history[history.length - 1].hours - history[0].hours : 0;
  const spanMs = history.length >= 2 ? (new Date(history[history.length - 1].date) - new Date(history[0].date)) : 0;
  const spanDaysPrecise = history.length >= 2 ? Math.max(spanMs / 86400000, 1 / 24) : 0;
  // Bir günde en fazla 24 saat çalışılabileceği için ortalama bu değeri asla aşamaz.
  const avgPerDay = history.length >= 2 ? Math.min(totalDelta / spanDaysPrecise, 24) : 0;

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Saat Geçmişi" />
      <div className="px-4 py-4">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4">
          {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        {history.length < 2 ? (
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Bu motor için henüz yeterli geçmiş kaydı yok.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Toplam Artış</div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">{totalDelta.toLocaleString("tr-TR")} sa</div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Günlük Ort.</div>
                <div className="font-mono text-[15px] font-bold text-amber mt-1">{avgPerDay.toFixed(1)} sa</div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Kayıt Sayısı</div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">{history.length}</div>
              </div>
            </div>

            <div className="mb-4">
              <MiniLineChart points={history.map((h) => ({ y: h.hours }))} />
            </div>

            <div className="flex flex-col gap-1.5">
              {[...history].reverse().map((h, idx) => {
                const prev = history[history.length - 2 - idx];
                const delta = prev ? h.hours - prev.hours : null;
                return (
                  <div key={idx} className="flex items-center justify-between bg-panel border border-border rounded-xl px-3 py-2.5">
                    <span className="text-[12px] text-text">{new Date(h.date).toLocaleDateString("tr-TR")}</span>
                    <span className="font-mono text-[12.5px] font-semibold text-text">{h.hours.toLocaleString("tr-TR")}</span>
                    <span className="font-mono text-[11.5px] text-teal">{delta === null ? "İlk kayıt" : `+${delta.toLocaleString("tr-TR")}`}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
