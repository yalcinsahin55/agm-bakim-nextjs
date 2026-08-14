"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import EngineBadge from "@/components/EngineBadge";
import { engineSortKey } from "@/lib/status";

export default function AraliklarPage() {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState("Tümü");

  useEffect(() => {
    fetch("/api/records?limit=1000").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setRecords(data);
      setLoading(false);
    });
  }, [router]);

  const groups = useMemo(() => {
    const sorted = [...records].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const map = {};
    sorted.forEach((r) => {
      const key = `${r.engine_name}::${r.type_key}`;
      if (!map[key]) map[key] = { engine: r.engine_name, typeLabel: r.type_label, entries: [] };
      map[key].entries.push(r);
    });
    return Object.values(map).sort((a, b) => engineSortKey(a.engine) - engineSortKey(b.engine));
  }, [records]);

  const engineNames = useMemo(() => Array.from(new Set(records.map((r) => r.engine_name))).sort((a, b) => engineSortKey(a) - engineSortKey(b)), [records]);
  const filteredGroups = engineFilter === "Tümü" ? groups : groups.filter((g) => g.engine === engineFilter);

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  if (records.length === 0) {
    return (
      <div>
        <TopBar title="Bakım Aralıkları" />
        <div className="px-4 py-4">
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">
            Henüz tamamlanmış bakım yok. İlk bakımı kaydettiğinizde burada birikmeye başlayacak.
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Aralıkları" subtitle="Art arda tamamlanan bakımlar arasında geçen saat farkı" />
      <div className="px-4 py-4">
        <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4">
          <option value="Tümü">Tüm Motorlar</option>
          {engineNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <div className="flex flex-col gap-3">
          {filteredGroups.map((g, gi) => {
            const avg = g.entries.length >= 2
              ? (g.entries[g.entries.length - 1].hour_at_completion - g.entries[0].hour_at_completion) / (g.entries.length - 1)
              : null;
            return (
              <div key={gi} className="bg-panel border border-border rounded-card overflow-hidden">
                <div className="flex items-center justify-between gap-2 p-3 bg-panel2 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <EngineBadge name={g.engine} size={26} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-text truncate">{g.typeLabel}</div>
                      <div className="text-[10.5px] text-faint">{g.engine}</div>
                    </div>
                  </div>
                  {avg !== null && (
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-[14px] font-bold text-amber">{avg.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} sa</div>
                      <div className="text-[8.5px] text-faint uppercase">Ortalama</div>
                    </div>
                  )}
                </div>
                {g.entries.map((entry, idx) => {
                  const prev = idx > 0 ? g.entries[idx - 1] : null;
                  const delta = prev ? entry.hour_at_completion - prev.hour_at_completion : null;
                  return (
                    <div key={entry._id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border last:border-b-0">
                      <div className="w-5 h-5 rounded-full bg-green/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-extrabold text-green">{idx + 1}</span>
                      </div>
                      <div className="flex-1 text-[11.5px] text-text min-w-0">
                        {new Date(entry.created_at).toLocaleDateString("tr-TR")} · {entry.hour_at_completion.toLocaleString("tr-TR")} sa{entry.technician_name ? ` · ${entry.technician_name}` : ""}
                      </div>
                      {delta === null ? (
                        <span className="text-[10.5px] font-bold text-faint">MİLAD</span>
                      ) : (
                        <span className="font-mono text-[12.5px] font-bold text-teal">{delta.toLocaleString("tr-TR")} sa</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
