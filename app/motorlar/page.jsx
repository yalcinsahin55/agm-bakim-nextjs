"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import EngineBadge from "@/components/EngineBadge";
import GaugeCardList from "@/components/GaugeCardList";
import { engineSortKey, STATUS_COLORS } from "@/lib/status";

const SORT_OPTIONS = [
  ["durum", "Durum"],
  ["no", "Motor No"],
  ["saat", "Çalışma Saati"],
  ["yuk", "Yük"],
];

export default function MotorlarPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("durum");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch("/api/maintenance-types/panel").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setItems(data.items);
      setEngines(data.engines);
      setLoading(false);
    });
  }, [router]);

  const rows = useMemo(() => {
    const statusOrder = { gecikmis: 0, kritik: 1, yaklasiyor: 2, normal: 3 };
    let list = engines
      .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
      .map((e) => {
        const engItems = items.filter((i) => i.engine_id === e._id).sort((a, b) => a.remaining - b.remaining);
        const worst = engItems[0];
        return { engine: e, items: engItems, status: worst ? worst.status : "normal", worstRemaining: worst ? worst.remaining : 999999 };
      });

    if (sortBy === "durum") list.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.worstRemaining - b.worstRemaining);
    else if (sortBy === "no") list.sort((a, b) => engineSortKey(a.engine.name) - engineSortKey(b.engine.name));
    else if (sortBy === "saat") list.sort((a, b) => b.engine.hours - a.engine.hours);
    else list.sort((a, b) => (b.engine.load_kw || 0) - (a.engine.load_kw || 0));

    return list;
  }, [engines, items, query, sortBy]);

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Motorlar" subtitle={`${engines.length} motor · Bir motoru açarak tüm bakımlarını görün`} />
      <div className="px-4 py-4">
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Motor ara (örn. AGM 12)"
          className="w-full bg-panel2 border border-border rounded-xl px-4 py-2.5 text-sm mb-2 outline-none focus:border-teal"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-3">
          {SORT_OPTIONS.map(([key, label]) => (
            <button
              key={key} onClick={() => setSortBy(key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${sortBy === key ? "bg-teal/10 text-teal border-teal/40" : "text-faint border-border"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {rows.map(({ engine, items: engItems, status }) => {
            const isOpen = expanded === engine._id;
            const color = STATUS_COLORS[status];
            return (
              <div key={engine._id} className="bg-panel border border-border rounded-card overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
                <button onClick={() => setExpanded(isOpen ? null : engine._id)} className="w-full flex items-center gap-3 p-3 text-left">
                  <EngineBadge name={engine.name} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-text">{engine.name}</div>
                    <div className="flex gap-2.5 mt-0.5">
                      <span className="font-mono text-[11px] text-muted">{engine.hours.toLocaleString("tr-TR")} sa</span>
                      <span className="font-mono text-[11px] text-faint">{(engine.load_kw || 0).toLocaleString("tr-TR")} kW</span>
                    </div>
                  </div>
                  <span className="text-faint text-base">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    {engItems.length === 0 ? (
                      <div className="text-center text-faint text-xs py-4">Bu motor için tanımlı bakım türü yok.</div>
                    ) : (
                      <GaugeCardList rows={engItems.map((i) => ({
                        key: i.type_key,
                        title: i.type_label,
                        subtitle: `Periyot ${i.period.toLocaleString("tr-TR")} sa · Son bakım ${i.last_hour.toLocaleString("tr-TR")} sa · Çalışılan ${(i.engine_hours - i.last_hour).toLocaleString("tr-TR")} sa`,
                        status: i.status, remaining: i.remaining, period: i.period,
                        valueLabel: (i.remaining <= 0 ? "+" : "") + Math.abs(Math.round(i.remaining)).toLocaleString("tr-TR"),
                        unitLabel: i.remaining <= 0 ? "SAAT GECİKME" : "SAAT KALDI",
                      }))} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
