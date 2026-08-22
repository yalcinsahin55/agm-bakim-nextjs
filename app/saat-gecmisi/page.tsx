"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

interface HistoryEntry {
  date: string;
  hours: number;
  load_kw?: number;
}

interface Engine {
  _id: string;
  name: string;
  hours: number;
  history?: HistoryEntry[];
  load_kw?: number;
}

interface ChartPoint {
  y: number;
  label: string;
}

function MiniLineChart({ points, color = "#e8952f", label = "" }: { points: ChartPoint[]; color?: string; label?: string }) {
  if (points.length < 2) return null;
  const w = 400, h = 140, pad = 15;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  
  const path = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const areaPath = path + ` L${pad + (w - pad * 2)},${h - pad} L${pad},${h - pad} Z`;

  return (
    <div className="relative bg-panel border border-border rounded-card p-3 hover:border-borderlt transition-all group">
      {label && <div className="text-[10px] text-faint uppercase font-bold mb-2">{label}</div>}
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#gradient-${color})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const x = pad + (i / (points.length - 1)) * (w - pad * 2);
          const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <title>{`${p.label || i + 1}: ${p.y.toLocaleString("tr-TR")}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

export default function SaatGecmisiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editLoad, setEditLoad] = useState("");
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/engines?include_history=true");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json() as Engine[];
    setEngines(data);
    setLoading(false);
    if (data.length && !selected) {
      const sorted = [...data].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
      setSelected(sorted[0]._id);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const engine = engines.find((e) => e._id === selected);
  
  const history = useMemo(() => {
    if (!engine) return [];
    return [...(engine.history || [])].sort((a: HistoryEntry, b: HistoryEntry) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [engine]);

  const hasLoadData = history.some((h) => typeof h.load_kw === "number");

  const totalDelta = history.length >= 2 ? history[history.length - 1].hours - history[0].hours : 0;
  const spanMs = history.length >= 2 
    ? (new Date(history[history.length - 1].date).getTime() - new Date(history[0].date).getTime())
    : 0;
  const spanDaysPrecise = history.length >= 2 ? Math.max(spanMs / 86400000, 1 / 24) : 0;
  const avgPerDay = history.length >= 2 ? Math.min(totalDelta / spanDaysPrecise, 24) : 0;

  const canEdit = user?.role === "yonetici";

  function startEdit(realIdx: number) {
    const h = history[realIdx];
    setEditingIdx(realIdx);
    setEditDate(new Date(h.date).toISOString().slice(0, 10));
    setEditHours(String(h.hours));
    setEditLoad(typeof h.load_kw === "number" ? String(h.load_kw) : "");
    setConfirmDeleteIdx(null);
  }

  async function saveHistory(newHistory: HistoryEntry[]) {
    setSaving(true);
    const loadingToast = toast.loading("Kaydediliyor...");
    try {
      const res = await fetch(`/api/engines/${selected}/history`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: newHistory }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Kayıt güncellendi! ✅");
        setEditingIdx(null); setConfirmDeleteIdx(null);
        await load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kaydedilemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  function saveEdit(realIdx: number) {
    const newHistory = history.map((h, i) => (
      i === realIdx
        ? { date: new Date(editDate).toISOString(), hours: Number(editHours), load_kw: editLoad !== "" ? Number(editLoad) : undefined }
        : h
    ));
    saveHistory(newHistory);
  }

  function deleteEntry(realIdx: number) {
    const newHistory = history.filter((_, i) => i !== realIdx);
    saveHistory(newHistory);
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Saat Geçmişi" subtitle="" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-4" />
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-36 w-full rounded-xl mb-4" />
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-36 w-full rounded-xl mb-4" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Saat Geçmişi" subtitle={engine ? engine.name : ""} />
      <div className="px-4 py-4">
        <select 
          value={selected} 
          onChange={(e: ChangeEvent<HTMLSelectElement>) => { setSelected(e.target.value); setEditingIdx(null); setConfirmDeleteIdx(null); }} 
          className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition"
        >
          {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        {history.length < 2 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm text-muted">Bu motor için henüz yeterli geçmiş kaydı yok.</p>
            <p className="text-xs text-faint mt-1">En az 2 kayıt gerekli.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Modern İstatistik Kartları */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-panel border border-border rounded-card p-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📈</span>
                  <div className="text-[9px] text-faint uppercase font-bold">Toplam Artış</div>
                </div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">{totalDelta.toLocaleString("tr-TR")} sa</div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">⚡</span>
                  <div className="text-[9px] text-faint uppercase font-bold">Günlük Ort.</div>
                </div>
                <div className="font-mono text-[15px] font-bold text-amber mt-1">{avgPerDay.toFixed(1)} sa</div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📋</span>
                  <div className="text-[9px] text-faint uppercase font-bold">Kayıt Sayısı</div>
                </div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">{history.length}</div>
              </div>
            </div>

            {/* Geliştirilmiş Grafikler */}
            <div className="mb-4">
              <MiniLineChart points={history.map((h) => ({ y: h.hours, label: new Date(h.date).toLocaleDateString("tr-TR") }))} color="#e8952f" label="Çalışma Saati" />
            </div>

            {hasLoadData && (
              <div className="mb-4">
                <MiniLineChart points={history.filter((h) => typeof h.load_kw === "number").map((h) => ({ y: h.load_kw as number, label: new Date(h.date).toLocaleDateString("tr-TR") }))} color="#3fb5c4" label="Yük (kW)" />
              </div>
            )}

            {/* Geçmiş Kayıtlar */}
            <div className="flex flex-col gap-1.5">
              {[...history].reverse().map((h, idx) => {
                const realIdx = history.length - 1 - idx;
                const prev = history[realIdx - 1];
                const delta = prev ? h.hours - prev.hours : null;
                const isEditing = editingIdx === realIdx;

                if (isEditing) {
                  return (
                    <div key={realIdx} className="bg-panel border border-teal/40 rounded-xl px-3 py-2.5 flex flex-col gap-2 animate-fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input type="date" value={editDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEditDate(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal" />
                        <input type="number" value={editHours} onChange={(e) => setEditHours(e.target.value)} placeholder="Saat" className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] font-mono outline-none focus:border-teal" />
                        <input type="number" value={editLoad} onChange={(e) => setEditLoad(e.target.value)} placeholder="Yük (kW)" className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] font-mono outline-none focus:border-teal" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingIdx(null)} className="flex-1 py-1.5 rounded-lg border border-border text-muted font-bold text-[11.5px] hover:bg-panel2 transition">Vazgeç</button>
                        <button onClick={() => saveEdit(realIdx)} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-teal text-[#06181b] font-bold text-[11.5px] disabled:opacity-50 hover:brightness-110 transition"> Kaydet</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={realIdx} className="flex items-center gap-2 bg-panel border border-border rounded-xl px-3 py-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5 group">
                    <span className="text-[12px] text-text flex-shrink-0 w-20">{new Date(h.date).toLocaleDateString("tr-TR")}</span>
                    <span className="font-mono text-[12.5px] font-semibold text-text flex-1 text-center">
                      {h.hours.toLocaleString("tr-TR")} sa
                      {typeof h.load_kw === "number" && <span className="text-teal"> · {h.load_kw.toLocaleString("tr-TR")} kW</span>}
                    </span>
                    <span className="font-mono text-[11.5px] text-amber flex-shrink-0">{delta === null ? "İlk kayıt" : `+${delta.toLocaleString("tr-TR")}`}</span>
                    {canEdit && (
                      confirmDeleteIdx === realIdx ? (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => deleteEntry(realIdx)} disabled={saving} className="text-[10px] font-bold text-[#1a1206] bg-red rounded-md px-1.5 py-1 hover:brightness-110 transition">Evet</button>
                          <button onClick={() => setConfirmDeleteIdx(null)} className="text-[10px] font-bold text-muted border border-border rounded-md px-1.5 py-1 hover:bg-panel2 transition">Vazgeç</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition">
                          <button onClick={() => startEdit(realIdx)} className="text-[11px] text-teal px-1 hover:scale-110 transition">✏️</button>
                          <button onClick={() => setConfirmDeleteIdx(realIdx)} className="text-[11px] text-red px-1 hover:scale-110 transition">🗑️</button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
