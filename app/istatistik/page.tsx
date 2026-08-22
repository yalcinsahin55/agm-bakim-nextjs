"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { cachedFetch } from "@/lib/apiCache";

interface BarItem {
  label: string;
  count: number;
}

interface AnalyticsSummary {
  total: number;
  thisCount: number;
  lastCount: number;
  byType: Array<{ type: string; count: number }>;
  byEngine: Array<{ engine: string; count: number }>;
}

const EMPTY_SUMMARY: AnalyticsSummary = { total: 0, thisCount: 0, lastCount: 0, byType: [], byEngine: [] };

function BarList({ items, color }: { items: BarItem[]; color: string }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-muted font-semibold truncate pr-2">{item.label}</span>
            <span className="text-text font-mono font-bold flex-shrink-0">{item.count}</span>
          </div>
          <div className="h-2 rounded-full bg-panel2 overflow-hidden">
            <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IstatistikPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const data = await cachedFetch<AnalyticsSummary>("/api/analytics/summary", 30_000);
      setSummary({
        total: Number(data.total || 0),
        thisCount: Number(data.thisCount || 0),
        lastCount: Number(data.lastCount || 0),
        byType: Array.isArray(data.byType) ? data.byType : [],
        byEngine: Array.isArray(data.byEngine) ? data.byEngine : [],
      });
    } catch (loadError) {
      console.error("İstatistikler yüklenemedi:", loadError);
      setError("İstatistikler yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div>
        <TopBar title="İstatistikler" />
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
          <Skeleton className="h-56 rounded-card mb-4" /><Skeleton className="h-56 rounded-card" />
        </div>
        <BottomNav />
      </div>
    );
  }

  const monthName = new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const diff = summary.thisCount - summary.lastCount;
  const topTypes: BarItem[] = summary.byType.slice(0, 6).map((item) => ({ label: item.type, count: item.count }));
  const topEngines: BarItem[] = summary.byEngine.slice(0, 6).map((item) => ({ label: item.engine, count: item.count }));

  return (
    <div>
      <TopBar title="İstatistikler" subtitle={`${summary.total} kayıt analiz edildi`} />
      <div className="px-4 py-4">
        {error && <div className="mb-4 rounded-card border border-red/40 bg-red/10 p-3 text-[12px] text-red" role="alert"><div className="font-bold">{error}</div><button onClick={() => void load()} className="mt-2 rounded-lg bg-red px-3 py-1.5 text-[11px] font-bold text-white">Tekrar dene</button></div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center"><div className="text-[10px] font-bold text-faint uppercase">Bu Ay</div><div className="font-mono text-2xl font-bold text-amber mt-1">{summary.thisCount}</div><div className="text-[9.5px] text-faint mt-0.5 capitalize">{monthName}</div></div>
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center"><div className="text-[10px] font-bold text-faint uppercase">Geçen Ay</div><div className="font-mono text-2xl font-bold text-text mt-1">{summary.lastCount}</div></div>
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center"><div className="text-[10px] font-bold text-faint uppercase">Değişim</div><div className={`font-mono text-2xl font-bold mt-1 ${diff >= 0 ? "text-green" : "text-red"}`}>{diff >= 0 ? "+" : ""}{diff}</div></div>
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center"><div className="text-[10px] font-bold text-faint uppercase">Toplam</div><div className="font-mono text-2xl font-bold text-teal mt-1">{summary.total}</div></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-panel border border-border rounded-card p-4"><h2 className="font-display text-[13px] font-bold uppercase tracking-wide mb-3">🔧 En Çok Yapılan Bakımlar</h2>{topTypes.length ? <BarList items={topTypes} color="bg-amber" /> : <p className="text-[11px] text-faint">Henüz veri yok.</p>}</div>
          <div className="bg-panel border border-border rounded-card p-4"><h2 className="font-display text-[13px] font-bold uppercase tracking-wide mb-3">⚙️ En Çok Bakım Gören Motorlar</h2>{topEngines.length ? <BarList items={topEngines} color="bg-teal" /> : <p className="text-[11px] text-faint">Henüz veri yok.</p>}</div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
