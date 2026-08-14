"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { engineSortKey } from "@/lib/status";

// Günlük ortalama çalışma saatini hesaplayan güvenli fonksiyon
const calculateDailyAverage = (
  currentHours,
  prevHours,
  currentDateStr,
  prevDateStr,
  decimals = 1
) => {
  const currH = Number(currentHours);
  const prevH = Number(prevHours);

  // 1. Değer varlığı ve sayısal geçerlilik kontrolü (0 meşru bir sayaç değeridir)
  if (
    currentHours === null || currentHours === undefined || isNaN(currH) ||
    prevHours === null || prevHours === undefined || isNaN(prevH) ||
    !currentDateStr || !prevDateStr
  ) {
    return 0;
  }

  // 2. Sayaç sıralama kontrolü (Güncel saat öncekinden az veya eşitse artış yok kabul edilir)
  if (currH <= prevH) {
    return 0;
  }

  // 3. Tarih geçerlilik kontrolü
  const currentT = new Date(currentDateStr).getTime();
  const prevT = new Date(prevDateStr).getTime();

  if (isNaN(currentT) || isNaN(prevT)) {
    return 0;
  }

  // 4. Zaman farkı hesaplama
  const diffInMs = currentT - prevT;

  // Aynı gün girilmişse veya tarih sırası tersterse (diffInMs <= 0)
  if (diffInMs <= 0) {
    const hoursDelta = currH - prevH;
    return Math.min(Math.max(hoursDelta, 0), 24);
  }

  // Milisaniyeyi güne çevir
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
  const hoursDelta = currH - prevH;
  const rawAvg = hoursDelta / diffInDays;

  // 5. Günlük 24 saat sınırı koy ve ondalık hassasiyetini ayarla
  const clampedAvg = Math.min(Math.max(rawAvg, 0), 24);
  const factor = Math.pow(10, decimals);
  return Math.round(clampedAvg * factor) / factor;
};

function MiniLineChart({ points }) {
  if (!points || points.length < 2) return null;
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
      setEngines(data || []);
      setLoading(false);
      if (data && data.length) {
        const sorted = [...data].sort((a, b) => engineSortKey(a?.name || "") - engineSortKey(b?.name || ""));
        setSelected(sorted[0]._id);
      }
    }).catch(() => setLoading(false));
  }, [router]);

  const sortedEngines = useMemo(
    () => [...engines].sort((a, b) => engineSortKey(a?.name || "") - engineSortKey(b?.name || "")),
    [engines]
  );
  
  const engine = engines.find((e) => e._id === selected);
  
  const history = useMemo(() => {
    if (!engine) return [];
    return [...(engine.history || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [engine]);

  // Toplam saat farkı
  const totalDelta = history.length >= 2 
    ? Math.max(0, history[history.length - 1].hours - history[0].hours) 
    : 0;

  // Güvenli genel günlük ortalama hesaplama
  const overallDailyAvg = history.length >= 2
    ? calculateDailyAverage(
        history[history.length - 1].hours,
        history[0].hours,
        history[history.length - 1].date,
        history[0].date
      )
    : 0;

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Saat Geçmişi" />
      <div className="px-4 py-4">
        <select 
          value={selected} 
          onChange={(e) => setSelected(e.target.value)} 
          className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none"
        >
          {sortedEngines.map((e) => (
            <option key={e._id} value={e._id}>{e.name}</option>
          ))}
        </select>

        {history.length < 2 ? (
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">
            Bu motor için henüz yeterli geçmiş kaydı yok.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Toplam Artış</div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">
                  {totalDelta.toLocaleString("tr-TR")} sa
                </div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Günlük Ort.</div>
                <div className="font-mono text-[15px] font-bold text-amber mt-1">
                  {overallDailyAvg.toLocaleString("tr-TR")} sa
                </div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Kayıt Sayısı</div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">
                  {history.length}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <MiniLineChart points={history.map((h) => ({ y: Number(h.hours) || 0 }))} />
            </div>

            <div className="flex flex-col gap-1.5">
              {[...history].reverse().map((h, idx) => {
                const prev = history[history.length - 2 - idx];
                const delta = prev ? h.hours - prev.hours : null;
                
                // İki kayıt arasındaki dönemsel günlük ortalamayı hesapla
                const intervalDailyAvg = prev 
                  ? calculateDailyAverage(h.hours, prev.hours, h.date, prev.date) 
                  : null;

                return (
                  <div key={idx} className="flex items-center justify-between bg-panel border border-border rounded-xl px-3 py-2.5">
                    <span className="text-[12px] text-text">
                      {new Date(h.date).toLocaleDateString("tr-TR")}
                    </span>
                    <span className="font-mono text-[12.5px] font-semibold text-text">
                      {Number(h.hours).toLocaleString("tr-TR")} sa
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-[11.5px] text-teal">
                        {delta === null ? "İlk kayıt" : `+${delta.toLocaleString("tr-TR")} sa`}
                      </span>
                      {intervalDailyAvg !== null && intervalDailyAvg > 0 && (
                        <span className="font-mono text-[10px] text-amber">
                          {intervalDailyAvg} sa/gün
                        </span>
                      )}
                    </div>
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
