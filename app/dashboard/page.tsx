"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import StatCards from "@/components/StatCards";
import LoadCards from "@/components/LoadCards";
import GaugeCardList from "@/components/GaugeCardList";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { cachedFetch } from "@/lib/apiCache";
import { engineSortKey, type PanelItem, type StatusKey } from "@/lib/status";

interface DashboardEngine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface AnalyticsSummary {
  monthly: Array<{ month: string; count: number }>;
  byEngine: Array<{ engine_id: string | null; engine: string; count: number }>;
  thisCount: number;
  lastCount: number;
}

interface PanelResponse {
  items: PanelItem[];
  engines: DashboardEngine[];
}

const EMPTY_ANALYTICS: AnalyticsSummary = { monthly: [], byEngine: [], thisCount: 0, lastCount: 0 };
type EnginePeriod = "all" | "month" | "3months" | "year";
const ENGINE_PERIOD_LABELS: Record<EnginePeriod, string> = {
  all: "Tümü",
  month: "Bu ay",
  "3months": "Son 3 ay",
  year: "Bu yıl",
};
const STATUS_LABEL_TO_KEY: Record<string, StatusKey> = {
  "Gecikmiş": "gecikmis",
  "Kritik": "kritik",
  "Yaklaşıyor": "yaklasiyor",
  "Normal": "normal",
};
const ENGINE_STATUS_PRIORITY: StatusKey[] = ["gecikmis", "kritik", "yaklasiyor", "normal"];
const ENGINE_STATUS_VIEW: Record<StatusKey, { label: string; dot: string; bar: string; text: string }> = {
  gecikmis: { label: "Gecikmiş", dot: "bg-red", bar: "from-red to-[#ff7a7f]", text: "text-red" },
  kritik: { label: "Kritik", dot: "bg-orange", bar: "from-orange to-[#ffc078]", text: "text-orange" },
  yaklasiyor: { label: "Yaklaşıyor", dot: "bg-amber", bar: "from-amber to-[#ffe08a]", text: "text-amber" },
  normal: { label: "Normal", dot: "bg-green", bar: "from-green to-[#79e7b5]", text: "text-green" },
};

function engineStatus(items: PanelItem[]): StatusKey {
  return ENGINE_STATUS_PRIORITY.find((status) => items.some((item) => item.status === status)) || "normal";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const [items, setItems] = useState<PanelItem[]>([]);
  const [engines, setEngines] = useState<DashboardEngine[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [enginePeriod, setEnginePeriod] = useState<EnginePeriod>("all");
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [statusFilter, setStatusFilter] = useState("Tümü");

  async function loadAnalytics(period: EnginePeriod = enginePeriod) {
    setAnalyticsLoading(true);
    try {
      const summary = await cachedFetch<AnalyticsSummary>(`/api/analytics/summary?period=${period}`, 30_000);
      setAnalytics({
        monthly: Array.isArray(summary.monthly) ? summary.monthly : [],
        byEngine: Array.isArray(summary.byEngine) ? summary.byEngine : [],
        thisCount: Number(summary.thisCount || 0),
        lastCount: Number(summary.lastCount || 0),
      });
    } catch (analyticsError) {
      console.warn("Dashboard analytics yüklenemedi:", analyticsError);
      setAnalytics(EMPTY_ANALYTICS);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadDashboard() {
    setError("");
    setRefreshing(true);
    try {
      const panel = await cachedFetch<PanelResponse>("/api/maintenance-types/panel", 15_000);
      setItems(Array.isArray(panel.items) ? panel.items : []);
      setEngines(Array.isArray(panel.engines) ? panel.engines : []);
      setLoading(false);
      void loadAnalytics();
    } catch (loadError) {
      console.error("Dashboard yüklenemedi:", loadError);
      setError("Dashboard verileri yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { gecikmis: 0, kritik: 0, yaklasiyor: 0, normal: 0 };
    items.forEach((item) => { if (item.status in c) c[item.status] += 1; });
    return c;
  }, [items]);

  const typeOptions = useMemo(() => {
    const labels = Array.from(new Set(items.map((item) => item.type_label))).sort((a, b) => a.localeCompare(b, "tr"));
    return ["Tümü", ...labels];
  }, [items]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const engineStatusById = useMemo(() => {
    const result: Record<string, { status: StatusKey; attention: number }> = {};
    sortedEngines.forEach((engine) => {
      const engineItems = items.filter((item) => item.engine_id === engine._id);
      result[engine._id] = {
        status: engineStatus(engineItems),
        attention: engineItems.filter((item) => item.status !== "normal").length,
      };
    });
    return result;
  }, [items, sortedEngines]);
  const engineStatusSummary = useMemo(() => {
    const summary: Record<StatusKey, number> = { gecikmis: 0, kritik: 0, yaklasiyor: 0, normal: 0 };
    Object.values(engineStatusById).forEach(({ status }) => { summary[status] += 1; });
    return summary;
  }, [engineStatusById]);
  const engineChartRows = useMemo(() => analytics.byEngine.slice(0, 12).map((row) => ({
    ...row,
    status: row.engine_id ? engineStatusById[row.engine_id]?.status || "normal" : "normal",
    attention: row.engine_id ? engineStatusById[row.engine_id]?.attention || 0 : 0,
  })), [analytics.byEngine, engineStatusById]);
  const maxEngineMaintenance = useMemo(() => Math.max(...engineChartRows.map((row) => row.count), 1), [engineChartRows]);
  const totalLoad = sortedEngines.reduce((sum, engine) => sum + (engine.load_kw || 0), 0);
  const avgLoad = sortedEngines.length ? totalLoad / sortedEngines.length : 0;
  const healthRows = useMemo(() => sortedEngines.map((engine) => {
    const engineItems = items.filter((item) => item.engine_id === engine._id);
    const penalty = engineItems.reduce((sum, item) => sum + (item.status === "gecikmis" ? 25 : item.status === "kritik" ? 15 : item.status === "yaklasiyor" ? 5 : 0), 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));
    return { engine, score, attention: engineItems.filter((item) => item.status !== "normal").length };
  }), [items, sortedEngines]);

  const filteredRows = useMemo(() => {
    let rows = items;
    if (typeFilter !== "Tümü") rows = rows.filter((item) => item.type_label === typeFilter);
    if (statusFilter !== "Tümü") rows = rows.filter((item) => item.status === STATUS_LABEL_TO_KEY[statusFilter]);
    return [...rows].sort((a, b) => a.remaining - b.remaining);
  }, [items, typeFilter, statusFilter]);

  const cardRows = filteredRows.map((row) => ({
    key: row.engine_id + row.type_key,
    title: row.engine_name,
    subtitle: `${row.type_label} · ${row.engine_hours.toLocaleString("tr-TR")} sa · Çalışılan ${(row.engine_hours - row.last_hour).toLocaleString("tr-TR")} sa`,
    status: row.status,
    remaining: row.remaining,
    period: row.period,
    valueLabel: (row.remaining <= 0 ? "+" : "") + Math.abs(Math.round(row.remaining)).toLocaleString("tr-TR"),
    unitLabel: row.remaining <= 0 ? "SAAT GECİKME" : "SAAT KALDI",
    badgeName: row.engine_name,
  }));

  const todayStr = new Date().toLocaleDateString("tr-TR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "";

  if (loading) {
    return (
      <div>
        <TopBar title="Avcıkoru Santrali Motor Bakım Merkezi" subtitle="Bakım Merkezi" />
        <div className="px-4 py-4">
          <Skeleton className="h-32 w-full rounded-card mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-40 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-56 mb-3" />
          <div className="flex flex-col gap-2 mb-4"><Skeleton className="h-10 w-full rounded-full" /><Skeleton className="h-10 w-full rounded-full" /></div>
          <div className="flex flex-col md:grid md:grid-cols-2 gap-3"><Skeleton className="h-32 rounded-card" /><Skeleton className="h-32 rounded-card" /></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Avcıkoru Santrali Motor Bakım Merkezi" subtitle={todayStr} />
      <div className="px-4 py-4">
        {error && (
          <div className="mb-4 rounded-card border border-red/40 bg-red/10 p-3.5 text-[12px] text-red" role="alert">
            <div className="font-bold">{error}</div>
            <button onClick={() => void loadDashboard()} className="mt-2 rounded-lg bg-red px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50" disabled={refreshing}>
              {refreshing ? "Yenileniyor..." : "Tekrar dene"}
            </button>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted">Bakım durumu ve motor özetleri</div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={refreshing}
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted transition hover:border-borderlt hover:text-text disabled:opacity-50"
          >
            {refreshing ? "Yenileniyor..." : "↻ Yenile"}
          </button>
        </div>

        <div className="bg-gradient-to-br from-amber/15 via-panel to-panel border border-amber/20 rounded-card p-4 mb-4 animate-fade-in">
          <div className="text-[15px] font-bold text-text">{greeting()}{firstName ? `, ${firstName}` : ""} 👋</div>
          <div className="text-[11px] text-muted mt-0.5">Motor bakım durumuna hızlı bir bakış at.</div>
          {counts.gecikmis > 0 ? (
            <div className="mt-2 text-[11.5px] text-red font-semibold">⏰ {counts.gecikmis} bakım gecikmiş durumda — hemen göz at!</div>
          ) : counts.kritik > 0 ? (
            <div className="mt-2 text-[11.5px] text-orange font-semibold">⚠️ {counts.kritik} bakım kritik seviyede.</div>
          ) : (
            <div className="mt-2 text-[11.5px] text-green font-semibold">✅ Tüm bakımlar yolunda görünüyor.</div>
          )}
          <div className="flex gap-2 mt-3">
            <Link href="/tamamla" className="flex-1 py-2 rounded-lg bg-amber text-[#161006] text-[11.5px] font-extrabold text-center hover:brightness-110 active:scale-[.98] transition">✅ Bakım Tamamla</Link>
            <Link href="/saat-guncelle" className="flex-1 py-2 rounded-lg border border-border text-muted text-[11.5px] font-bold text-center hover:bg-panel2 transition">🕒 Saat Güncelle</Link>
          </div>
        </div>

        {counts.gecikmis > 0 && (
          <div className="bg-red/10 border border-red/40 rounded-card p-4 mb-4 flex items-center gap-3 animate-fade-in">
            <span className="text-2xl">🚨</span>
            <div className="flex-1 min-w-0"><div className="text-[13px] font-bold text-red">{counts.gecikmis} bakım gecikmiş durumda!</div><div className="text-[11px] text-muted mt-0.5">Gecikmiş bakımlar motor ömrünü kısaltır, hemen planlayın.</div></div>
            <button onClick={() => { setStatusFilter("Gecikmiş"); setTypeFilter("Tümü"); }} className="flex-shrink-0 px-3 py-2 rounded-lg bg-red text-white text-[11px] font-extrabold hover:brightness-110 transition">Görüntüle</button>
          </div>
        )}

        <StatCards counts={counts} />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2" aria-label="Hızlı erişim">
          {[
            { href: "/kayitlar", icon: "📋", label: "Bakım Kayıtları" },
            { href: "/istatistik", icon: "📊", label: "İstatistikler" },
            { href: "/yag-analizleri", icon: "🧪", label: "Yağ Analizleri" },
            { href: "/takvim", icon: "📅", label: "Bakım Takvimi" },
          ].map((action) => (
            <Link key={action.href} href={action.href} className="rounded-xl border border-border bg-panel2 px-2.5 py-2.5 text-center text-[10.5px] font-bold text-muted transition hover:border-amber/40 hover:text-amber active:scale-[.98]">
              <span className="mr-1 text-sm" aria-hidden="true">{action.icon}</span>{action.label}
            </Link>
          ))}
        </div>
        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Bakım Trendi</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <div className="rounded-card border border-border bg-panel p-3.5">
            <div className="mb-3 text-[11px] font-bold uppercase text-muted">Son 6 Ay</div>
            {analyticsLoading ? <div className="h-28 animate-pulse rounded-lg bg-panel2" /> : (
              <div className="flex h-28 items-end gap-2">
                {analytics.monthly.length === 0 ? <span className="text-[11px] text-faint">Henüz trend verisi yok.</span> : analytics.monthly.map((row) => {
                  const max = Math.max(...analytics.monthly.map((item) => item.count), 1);
                  return <div key={row.month} className="flex min-w-0 flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-teal/80" style={{ height: `${Math.max((row.count / max) * 88, 6)}px` }} title={`${row.count} bakım`} /><span className="truncate text-[9px] text-faint">{row.month.slice(5)}</span></div>;
                })}
              </div>
            )}
          </div>
          <div className="rounded-card border border-border bg-panel p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase text-muted">Motor Bazlı Bakım Sayıları</div>
              <label className="flex items-center gap-1.5 text-[9px] text-faint">Tarih<select value={enginePeriod} onChange={(event) => { const period = event.target.value as EnginePeriod; setEnginePeriod(period); void loadAnalytics(period); }} className="rounded-md border border-border bg-panel2 px-1.5 py-1 text-[10px] font-bold text-text outline-none focus:border-amber" aria-label="Motor bakım grafiği tarih aralığı">{(Object.keys(ENGINE_PERIOD_LABELS) as EnginePeriod[]).map((period) => <option key={period} value={period}>{ENGINE_PERIOD_LABELS[period]}</option>)}</select></label>
            </div>
            {analyticsLoading ? <div className="flex h-36 items-end gap-2 px-1"><div className="h-16 flex-1 animate-pulse rounded-t bg-panel2" /><div className="h-24 flex-1 animate-pulse rounded-t bg-panel2" /><div className="h-20 flex-1 animate-pulse rounded-t bg-panel2" /><div className="h-28 flex-1 animate-pulse rounded-t bg-panel2" /></div> : (
              <div>
                {engineChartRows.length === 0 ? <span className="text-[11px] text-faint">Henüz bakım kaydı yok.</span> : (
                  <div className="flex h-36 items-end gap-1.5 overflow-x-auto px-1 pb-5 pt-2" aria-label="Motorlara göre bakım kayıt sayıları">
                    {engineChartRows.map((row) => {
                      const height = Math.max((row.count / maxEngineMaintenance) * 92, 8);
                      const href = row.engine_id ? `/motorlar?engine_id=${encodeURIComponent(row.engine_id)}` : "/motorlar";
                      const statusView = ENGINE_STATUS_VIEW[row.status];
                      return <Link key={row.engine_id || row.engine} href={href} className="group flex h-full min-w-[42px] flex-1 flex-col items-center justify-end gap-1 rounded-md px-0.5 outline-none transition hover:bg-amber/10 focus-visible:ring-2 focus-visible:ring-amber" title={`${row.engine}: ${row.count} bakım kaydı · Durum: ${statusView.label}${row.attention ? ` · ${row.attention} uyarı` : ""}`} aria-label={`${row.engine} motorunun ${row.count} bakım kaydı var; durum ${statusView.label}; detayları aç`}><span className={`text-[10px] font-mono font-bold ${statusView.text}`}>{row.count}</span><div className={`w-full max-w-12 rounded-t bg-gradient-to-t ${statusView.bar} transition-all group-hover:brightness-110`} style={{ height: `${height}px` }} /><span className="max-w-14 truncate text-[9px] text-faint">{row.engine}</span><span className={`h-1.5 w-1.5 rounded-full ${statusView.dot}`} aria-hidden="true" /></Link>;
                    })}
                  </div>
                )}
                {!analyticsLoading && Object.values(engineStatusSummary).some((count) => count > 0) && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-[9px]">{ENGINE_STATUS_PRIORITY.map((status) => <span key={status} className="inline-flex items-center gap-1 text-faint"><span className={`h-1.5 w-1.5 rounded-full ${ENGINE_STATUS_VIEW[status].dot}`} aria-hidden="true" />{ENGINE_STATUS_VIEW[status].label}: {engineStatusSummary[status]}</span>)}</div>}
              </div>
            )}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-card border border-border bg-panel p-3.5">
            <div className="mb-2 text-[11px] font-bold uppercase text-muted">Bakım Karşılaştırması</div>
            <div className="flex items-end justify-between gap-3">
              <div><div className="font-mono text-2xl font-extrabold text-amber">{analytics.thisCount}</div><div className="text-[10px] text-faint">Bu ay</div></div>
              <div className="pb-1 text-xl text-faint">vs.</div>
              <div className="text-right"><div className="font-mono text-2xl font-extrabold text-text">{analytics.lastCount}</div><div className="text-[10px] text-faint">Geçen ay</div></div>
            </div>
            {!analyticsLoading && <div className={`mt-2 text-[10.5px] font-bold ${analytics.thisCount >= analytics.lastCount ? "text-green" : "text-amber"}`}>
              {analytics.thisCount === analytics.lastCount ? "Geçen ay ile aynı sayıda bakım." : `${Math.abs(analytics.thisCount - analytics.lastCount)} bakım ${analytics.thisCount > analytics.lastCount ? "arttı" : "azaldı"}.`}
            </div>}
          </div>
          <div className="rounded-card border border-border bg-panel p-3.5">
            <div className="mb-2 text-[11px] font-bold uppercase text-muted">Hatırlatma Özeti</div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="rounded-lg bg-red/10 p-2"><div className="font-mono text-lg font-extrabold text-red">{counts.gecikmis}</div><div className="text-faint">Gecikmiş</div></div>
              <div className="rounded-lg bg-orange/10 p-2"><div className="font-mono text-lg font-extrabold text-orange">{counts.kritik}</div><div className="text-faint">Kritik</div></div>
              <div className="rounded-lg bg-amber/10 p-2"><div className="font-mono text-lg font-extrabold text-amber">{counts.yaklasiyor}</div><div className="text-faint">Yaklaşıyor</div></div>
            </div>
            <Link href="/bildirimler" className="mt-2 block text-center text-[10.5px] font-bold text-teal hover:underline">Bildirimleri aç →</Link>
          </div>
        </div>

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor Yükleri</h2>
        <div className="flex gap-4 text-xs text-muted mb-2"><span>Toplam <b className="text-text font-mono">{totalLoad.toLocaleString("tr-TR")}</b> kW</span><span>Ort. <b className="text-text font-mono">{avgLoad.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</b> kW</span></div>
        <LoadCards engines={sortedEngines} />

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor Sağlık Puanı</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 mb-5">
          {healthRows.map(({ engine, score, attention }) => {
            const tone = score >= 80 ? "text-green" : score >= 55 ? "text-amber" : "text-red";
            return <div key={engine._id} className="rounded-xl border border-border bg-panel p-3">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-[12px] font-bold text-text">{engine.name}</span><span className={`font-mono text-lg font-extrabold ${tone}`}>%{score}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full ${score >= 80 ? "bg-green" : score >= 55 ? "bg-amber" : "bg-red"}`} style={{ width: `${score}%` }} /></div>
              <div className="mt-1 text-[10px] text-faint">{attention ? `${attention} bakım maddesi dikkat istiyor` : "Tüm bakım maddeleri normal"}</div>
            </div>;
          })}
        </div>

        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Bakım Türüne Göre Görüntüle</h2>
        <div className="flex flex-wrap gap-2 mb-3">{typeOptions.map((option) => <button key={option} onClick={() => setTypeFilter(option)} className={`px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${typeFilter === option ? "bg-amber text-[#161006] shadow-lg" : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"}`}>{option}</button>)}</div>
        <div className="flex flex-wrap gap-2 mb-4">{["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((option) => <button key={option} onClick={() => setStatusFilter(option)} className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${statusFilter === option ? "bg-teal text-[#06181b] shadow-lg" : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"}`}>{option}</button>)}</div>
        {cardRows.length > 0 && <div className="text-[11px] text-muted mb-2"><b className="text-text">{cardRows.length}</b> bakım kaydı gösteriliyor</div>}
        <GaugeCardList rows={cardRows} />
        {cardRows.length === 0 && <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in"><div className="text-4xl mb-3">🔍</div><p className="text-sm text-muted">Seçili filtrelere uygun bakım kaydı bulunamadı.</p><button onClick={() => { setTypeFilter("Tümü"); setStatusFilter("Tümü"); }} className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel transition">Filtreleri Temizle</button></div>}
      </div>
      <BottomNav />
    </div>
  );
}
