"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import AppIcon from "@/components/ui/AppIcon";
import { ApiFetchError } from "@/lib/apiCache";
import { getMaintenancePanel } from "@/lib/maintenancePanel";
import type { PanelItem, StatusKey } from "@/lib/status";

const statusLabel: Record<string, string> = { gecikmis: "Gecikmiş", kritik: "Kritik", yaklasiyor: "Yaklaşıyor", normal: "Normal" };
const statusClass: Record<string, string> = { gecikmis: "text-red border-red/30 bg-red/5", kritik: "text-orange border-orange/30 bg-orange/5", yaklasiyor: "text-amber border-amber/30 bg-amber/5", normal: "text-green border-green/30 bg-green/5" };
const DAY = 24 * 60 * 60 * 1000;

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function forecastDate(item: PanelItem) { return new Date(Date.now() + Math.max(item.remaining, 0) * DAY); }

export default function TakvimPage() {
  const router = useRouter();
  const [items, setItems] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [status, setStatus] = useState<"all" | StatusKey>("all");
  const [engine, setEngine] = useState("all");

  useEffect(() => { getMaintenancePanel().then((data) => { setItems(data.items || []); setLoading(false); }).catch((error) => { if (error instanceof ApiFetchError && error.status === 401) router.push("/login"); else setLoading(false); }); }, [router]);

  const engines = useMemo(() => [...new Map(items.map((item) => [item.engine_id, item.engine_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "tr")), [items]);
  const filtered = useMemo(() => items.filter((item) => (status === "all" || item.status === status) && (engine === "all" || item.engine_id === engine)), [items, status, engine]);
  const byDate = useMemo(() => { const map = new Map<string, PanelItem[]>(); filtered.forEach((item) => { const key = dateKey(forecastDate(item)); map.set(key, [...(map.get(key) || []), item]); }); return map; }, [filtered]);
  const monthDays = useMemo(() => { const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate(); return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => { const day = index - offset + 1; return day < 1 || day > days ? null : new Date(monthDate.getFullYear(), monthDate.getMonth(), day); }); }, [monthDate]);
  const monthTitle = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(monthDate);
  const summary = { overdue: filtered.filter((item) => item.status === "gecikmis").length, urgent: filtered.filter((item) => item.status === "kritik" || item.status === "yaklasiyor").length };

  if (loading) return <><TopBar title="Bakım Takvimi" subtitle="Yükleniyor..." /><div className="p-4"><Skeleton className="h-40 rounded-card" /></div><BottomNav /></>;
  return <div><TopBar title="Bakım Takvimi" subtitle="Saat bazlı tahmini plan" /><main className="px-4 py-4">
    <section className="rounded-card border border-amber/20 bg-gradient-to-br from-amber/10 via-panel to-panel p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-amber"><AppIcon name="calendar" size={16} /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Planlama merkezi</span></div><h1 className="mt-1 text-[15px] font-bold text-text">Yaklaşan bakımlar</h1><p className="mt-1 text-[11px] leading-4 text-muted">Motor kullanım hızına göre tahmini tarihler. Tarihleri planlama kararı vermeden önce ekip takvimiyle doğrulayın.</p></div><div className="text-right"><div className="font-mono text-lg font-bold text-text">{filtered.length}</div><div className="text-[9px] text-faint">görev</div></div></div></section>
    <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-control border border-red/25 bg-red/5 p-2.5"><div className="text-[9px] uppercase text-faint">Gecikmiş</div><div className="mt-1 font-mono text-lg font-bold text-red">{summary.overdue}</div></div><div className="rounded-control border border-amber/25 bg-amber/5 p-2.5"><div className="text-[9px] uppercase text-faint">Yaklaşan</div><div className="mt-1 font-mono text-lg font-bold text-amber">{summary.urgent}</div></div></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><select aria-label="Motor filtresi" value={engine} onChange={(e) => setEngine(e.target.value)} className="min-h-11 rounded-control border border-border bg-panel2 px-3 text-xs text-text"><option value="all">Tüm motorlar</option>{engines.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Durum filtresi" value={status} onChange={(e) => setStatus(e.target.value as "all" | StatusKey)} className="min-h-11 rounded-control border border-border bg-panel2 px-3 text-xs text-text"><option value="all">Tüm durumlar</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <section className="mt-4 rounded-card border border-border bg-panel p-3"><div className="mb-3 flex items-center justify-between"><button aria-label="Önceki ay" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="min-h-11 min-w-11 rounded-control border border-border text-lg text-muted hover:text-text">‹</button><h2 className="text-sm font-bold capitalize text-text">{monthTitle}</h2><button aria-label="Sonraki ay" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="min-h-11 min-w-11 rounded-control border border-border text-lg text-muted hover:text-text">›</button></div><div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-faint">{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day) => <span key={day}>{day}</span>)}</div><div className="mt-1 grid grid-cols-7 gap-1">{monthDays.map((day, index) => { const tasks = day ? byDate.get(dateKey(day)) || [] : []; return <div key={index} className={`min-h-16 rounded-lg border p-1 ${day ? "border-border bg-panel2" : "border-transparent bg-transparent"}`}><div className="text-right text-[9px] text-faint">{day?.getDate()}</div>{tasks.slice(0, 2).map((item) => <button key={`${item.engine_id}-${item.type_key}`} onClick={() => router.push(`/tamamla?engine_id=${encodeURIComponent(item.engine_id)}&type_key=${encodeURIComponent(item.type_key)}`)} className={`mt-0.5 block w-full truncate rounded border px-1 py-0.5 text-left text-[8px] font-bold ${statusClass[item.status]}`}>{item.engine_name} · {item.type_label}</button>)}{tasks.length > 2 && <div className="px-1 text-[8px] text-faint">+{tasks.length - 2} görev</div>}</div>; })}</div></section>
    <section className="mt-4 space-y-2">{filtered.sort((a, b) => a.remaining - b.remaining).map((item) => <article key={`${item.engine_id}-${item.type_key}`} className="rounded-card border border-border bg-panel p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[13px] font-bold text-text">{item.engine_name}</div><div className="mt-0.5 text-[11px] text-muted">{item.type_label} · Tahmini {forecastDate(item).toLocaleDateString("tr-TR")}</div></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass[item.status]}`}>{statusLabel[item.status]}</span></div><div className="mt-3 flex items-center justify-between border-t border-border pt-2"><span className="text-[11px] text-faint">Motor saati: {item.engine_hours.toLocaleString("tr-TR")}</span><button onClick={() => router.push(`/tamamla?engine_id=${encodeURIComponent(item.engine_id)}&type_key=${encodeURIComponent(item.type_key)}`)} className="min-h-11 rounded-control bg-amber px-3 text-[11px] font-bold text-slate-950">Planla / başlat</button></div></article>)}{filtered.length === 0 && <div className="rounded-card border border-dashed border-border p-8 text-center text-xs text-muted">Bu filtrelerle eşleşen plan bulunamadı.</div>}</section>
  </main><BottomNav /></div>;
}
