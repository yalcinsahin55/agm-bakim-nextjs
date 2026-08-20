"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";

function BarList({ items, color }) {
  const max = items.length ? items[0][1] : 1;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(([label, count]) => (
        <div key={label}>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-muted font-semibold truncate pr-2">{label}</span>
            <span className="text-text font-mono font-bold flex-shrink-0">{count}</span>
          </div>
          <div className="h-2 rounded-full bg-panel2 overflow-hidden">
            <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IstatistikPage() {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/records?limit=1000").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    let thisCount = 0;
    let lastCount = 0;
    const byType = {};
    const byEngine = {};

    records.forEach((r) => {
      const d = new Date(r.created_at);
      if (d >= thisMonth) thisCount++;
      else if (d >= lastMonth) lastCount++;
      byType[r.type_label] = (byType[r.type_label] || 0) + 1;
      byEngine[r.engine_name] = (byEngine[r.engine_name] || 0) + 1;
    });

    return {
      thisCount,
      lastCount,
      total: records.length,
      diff: thisCount - lastCount,
      topTypes: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6),
      topEngines: Object.entries(byEngine).sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [records]);

  if (loading) {
    return (
      <div>
        <TopBar title="İstatistikler" />
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-56 rounded-card mb-4" />
          <Skeleton className="h-56 rounded-card" />
        </div>
        <BottomNav />
      </div>
    );
  }

  const monthName = new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <div>
      <TopBar title="İstatistikler" subtitle={`${stats.total} kayıt analiz edildi`} />
      <div className="px-4 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center">
            <div className="text-[10px] font-bold text-faint uppercase">Bu Ay</div>
            <div className="font-mono text-2xl font-bold text-amber mt-1">{stats.thisCount}</div>
            <div className="text-[9.5px] text-faint mt-0.5 capitalize">{monthName}</div>
          </div>
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center">
            <div className="text-[10px] font-bold text-faint uppercase">Geçen Ay</div>
            <div className="font-mono text-2xl font-bold text-text mt-1">{stats.lastCount}</div>
          </div>
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center">
            <div className="text-[10px] font-bold text-faint uppercase">Değişim</div>
            <div className={`font-mono text-2xl font-bold mt-1 ${stats.diff >= 0 ? "text-green" : "text-red"}`}>
              {stats.diff >= 0 ? "+" : ""}{stats.diff}
            </div>
          </div>
          <div className="bg-panel border border-border rounded-xl p-3.5 text-center">
            <div className="text-[10px] font-bold text-faint uppercase">Toplam</div>
            <div className="font-mono text-2xl font-bold text-teal mt-1">{stats.total}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-panel border border-border rounded-card p-4">
            <h2 className="font-display text-[13px] font-bold uppercase tracking-wide mb-3">🔧 En Çok Yapılan Bakımlar</h2>
            {stats.topTypes.length ? <BarList items={stats.topTypes} color="bg-amber" /> : <p className="text-[11px] text-faint">Henüz veri yok.</p>}
          </div>
          <div className="bg-panel border border-border rounded-card p-4">
            <h2 className="font-display text-[13px] font-bold uppercase tracking-wide mb-3">⚙️ En Çok Bakım Gören Motorlar</h2>
            {stats.topEngines.length ? <BarList items={stats.topEngines} color="bg-teal" /> : <p className="text-[11px] text-faint">Henüz veri yok.</p>}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
