"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import LoadCards from "@/components/LoadCards";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { cachedFetch } from "@/lib/apiCache";
import { engineSortKey, type PanelItem, type StatusKey } from "@/lib/status";
import { canAccessRoute } from "@/lib/permissions";

interface DashboardEngine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface PanelResponse {
  items: PanelItem[];
  engines: DashboardEngine[];
}


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

function greetingPresentation(hour: number) {
  if (hour < 6 || hour >= 20) {
    return {
      title: "İyi geceler",
      icon: "🌙",
      description: "Gece bakım durumunu sakin bir özetle kontrol et.",
      panelClass: "border-teal/30 bg-panel2",
      iconClass: "border-teal/30 bg-teal/10 text-teal",
      titleClass: "text-teal",
    };
  }
  if (hour < 12) {
    return {
      title: "Günaydın",
      icon: "☀️",
      description: "Bugünkü bakım planına hızlıca göz at.",
      panelClass: "border-amber/30 bg-panel2",
      iconClass: "border-amber/30 bg-amber/10 text-amber",
      titleClass: "text-amber",
    };
  }
  if (hour < 18) {
    return {
      title: "İyi günler",
      icon: "☀️",
      description: "Motor ve bakım durumlarını güncel tut.",
      panelClass: "border-teal/30 bg-panel2",
      iconClass: "border-teal/30 bg-teal/10 text-teal",
      titleClass: "text-teal",
    };
  }
  return {
    title: "İyi akşamlar",
    icon: "🌆",
    description: "Günün bakım durumunu gözden geçir.",
    panelClass: "border-amber/30 bg-panel2",
    iconClass: "border-amber/30 bg-amber/10 text-amber",
    titleClass: "text-amber",
  };
}

interface EngineHealthDetailsProps {
  engine: DashboardEngine;
  items: PanelItem[];
  onClose: () => void;
}

interface DashboardAssistantAnswer {
  question: string;
  title: string;
  summary: string;
  error?: boolean;
}

const DASHBOARD_ASSISTANT_QUICK_QUESTIONS = [
  "Bu ay kaç bakım yapıldı?",
  "Hangi bakımlar gecikmiş?",
  "Bakım istatistiklerinin özeti nedir?",
  "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
];

function DashboardAssistant(): JSX.Element {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<DashboardAssistantAnswer | null>(null);
  const [sending, setSending] = useState(false);

  async function ask(rawQuestion: string) {
    const nextQuestion = rawQuestion.trim();
    if (!nextQuestion || sending) return;
    setQuestion(nextQuestion);
    setAnswer(null);
    setSending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setAnswer({ question: nextQuestion, title: "Bakım Asistanı", summary: payload.message || payload.error || "Asistan şu anda yanıt veremiyor.", error: true });
        return;
      }
      setAnswer({ question: nextQuestion, title: payload.title || "Bakım Asistanı", summary: payload.summary || "Sonuç hazırlandı." });
    } catch {
      setAnswer({ question: nextQuestion, title: "Bakım Asistanı", summary: "Asistan isteği tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.", error: true });
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return <div className="mb-4 rounded-card border border-teal/30 bg-gradient-to-br from-teal/10 via-panel to-panel p-4 animate-fade-in">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="text-[14px] font-extrabold text-text">Bakım Asistanı</div><div className="mt-0.5 text-[11px] leading-5 text-muted">Dashboard’dan çıkmadan bakım raporlarını sor; yanıtı burada gör.</div></div>
      <span className="flex-shrink-0 rounded-full border border-green/30 bg-green/10 px-2 py-1 text-[9px] font-bold text-green">SALT OKUNUR</span>
    </div>
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} disabled={sending} placeholder="Örn. Bu ay kaç bakım yapıldı?" aria-label="Dashboard bakım asistanına soru yazın" className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2.5 text-[11px] text-text outline-none placeholder:text-faint focus:border-teal/60 disabled:opacity-60" />
      <button type="submit" disabled={sending || !question.trim()} className="rounded-xl bg-teal px-3.5 py-2.5 text-[10.5px] font-extrabold text-[#06181b] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "..." : "Sor"}</button>
    </form>
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {DASHBOARD_ASSISTANT_QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={sending} className="flex min-h-[44px] w-full items-center justify-start rounded-xl border border-border bg-panel2 px-2.5 py-2 text-left text-[9.5px] font-semibold leading-4 text-muted transition hover:border-teal/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-50">{item}</button>)}
    </div>
    {sending && <div className="mt-3 rounded-lg border border-teal/20 bg-panel2 px-3 py-2 text-[10.5px] text-muted" role="status" aria-live="polite">Raporlar okunuyor...</div>}
    {answer && !sending && <div className={`mt-3 rounded-lg border p-3 ${answer.error ? "border-red/30 bg-red/5" : "border-teal/20 bg-panel2"}`} role={answer.error ? "alert" : "status"}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-faint">{answer.title}</div>
      <div className="mt-1 text-[11.5px] leading-5 text-text">{answer.summary}</div>
      {!answer.error && <Link href={`/asistan?question=${encodeURIComponent(answer.question)}&auto=1`} className="mt-2 inline-flex text-[10px] font-bold text-teal hover:underline">Detaylı cevabı aç →</Link>}
    </div>}
    <div className="mt-2 text-[9px] text-faint">Yalnızca rapor verileri okunur; kayıt değişikliği yapılmaz.</div>
  </div>;
}

function EngineHealthDetails({ engine, items, onClose }: EngineHealthDetailsProps): JSX.Element {
  const sortedItems = [...items].sort((a, b) => a.remaining - b.remaining);
  return <div className="rounded-card border border-amber/30 bg-panel p-3.5 animate-fade-in">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><div className="text-[13px] font-bold text-text">{engine.name} bakım detayları</div><div className="mt-0.5 text-[10.5px] text-muted">Güncel motor saati: <b className="font-mono text-text">{engine.hours.toLocaleString("tr-TR")} sa</b></div></div>
      <button type="button" onClick={onClose} className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-bold text-muted hover:text-text">Kapat</button>
    </div>
    {sortedItems.length === 0 ? <div className="rounded-lg bg-panel2 p-3 text-[11px] text-faint">Bu motor için tanımlı bakım türü bulunamadı.</div> : <div className="grid grid-cols-1 gap-2">{sortedItems.map((item) => {
      const statusView = ENGINE_STATUS_VIEW[item.status];
      const workedHours = item.engine_hours - item.last_hour;
      return <div key={`${item.engine_id}-${item.type_key}`} className="rounded-lg border border-border bg-panel2 p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[11.5px] font-bold text-text">{item.type_label}</div><div className="mt-0.5 text-[9.5px] text-faint">Periyot: {item.period.toLocaleString("tr-TR")} sa</div></div><span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${statusView.text} bg-white/5`}>{statusView.label}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><div><div className="text-[9px] uppercase text-faint">Kalan</div><div className={`font-mono text-base font-extrabold ${statusView.text}`}>{item.remaining <= 0 ? `${Math.abs(Math.round(item.remaining)).toLocaleString("tr-TR")} sa gecikme` : `${Math.round(item.remaining).toLocaleString("tr-TR")} sa`}</div></div><div><div className="text-[9px] uppercase text-faint">Çalışılan</div><div className="font-mono text-base font-extrabold text-text">{Math.max(0, Math.round(workedHours)).toLocaleString("tr-TR")} sa</div></div></div>
        <div className="mt-2 text-[9.5px] text-faint">Son bakım: {item.last_hour.toLocaleString("tr-TR")} sa · Mevcut: {item.engine_hours.toLocaleString("tr-TR")} sa</div>
      </div>;
    })}</div>}
  </div>;
}

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const [items, setItems] = useState<PanelItem[]>([]);
  const [engines, setEngines] = useState<DashboardEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHealthEngineId, setSelectedHealthEngineId] = useState("");
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  async function loadDashboard() {
    setError("");
    setRefreshing(true);
    try {
      const panel = await cachedFetch<PanelResponse>("/api/maintenance-types/panel", 15_000);
      setItems(Array.isArray(panel.items) ? panel.items : []);
      setEngines(Array.isArray(panel.engines) ? panel.engines : []);
      setLoading(false);
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
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { gecikmis: 0, kritik: 0, yaklasiyor: 0, normal: 0 };
    items.forEach((item) => { if (item.status in c) c[item.status] += 1; });
    return c;
  }, [items]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const totalLoad = sortedEngines.reduce((sum, engine) => sum + (engine.load_kw || 0), 0);
  const avgLoad = sortedEngines.length ? totalLoad / sortedEngines.length : 0;
  const healthRows = useMemo(() => sortedEngines.map((engine) => {
    const engineItems = items.filter((item) => item.engine_id === engine._id);
    const penalty = engineItems.reduce((sum, item) => sum + (item.status === "gecikmis" ? 25 : item.status === "kritik" ? 15 : item.status === "yaklasiyor" ? 5 : 0), 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));
    return { engine, score, status: engineStatus(engineItems), attention: engineItems.filter((item) => item.status !== "normal").length };
  }), [items, sortedEngines]);
  const todayStr = currentTime.toLocaleDateString("tr-TR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "";
  const greetingView = greetingPresentation(currentTime.getHours());

  if (loading) {
    return (
      <div>
        <TopBar title="Avcıkoru Santrali Motor Bakım Merkezi" subtitle="Bakım Merkezi" />
        <div className="px-4 py-4">
          <Skeleton className="h-32 w-full rounded-card mb-4" />
          <Skeleton className="h-14 w-full rounded-card mb-4" />
          <Skeleton className="h-36 w-full rounded-card mb-4" />
          <Skeleton className="h-6 w-40 mb-3" />
          <Skeleton className="h-28 w-full rounded-card mb-5" />
          <Skeleton className="h-6 w-48 mb-3" />
          <div className="flex flex-col gap-2 mb-5"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
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

        <div className={`mb-4 rounded-card border p-4 animate-fade-in ${greetingView.panelClass}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border text-xl ${greetingView.iconClass}`} aria-hidden="true">{greetingView.icon}</div>
            <div className="min-w-0">
              <div className={`text-[15px] font-bold ${greetingView.titleClass}`}>{greetingView.title}{firstName ? `, ${firstName}` : ""}</div>
              <div className="mt-0.5 text-[11px] text-muted">{greetingView.description}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-semibold text-teal">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" />{sortedEngines.length} motor izleniyor</span>
            <span className="text-muted">·</span>
            <span className="text-muted">Sistem aktif</span>
          </div>
        </div>

        {counts.gecikmis > 0 && (
          <div className="bg-red/10 border border-red/40 rounded-card p-4 mb-4 flex items-center gap-3 animate-fade-in">
            <span className="text-2xl" aria-hidden="true">🚨</span>
            <div className="flex-1 min-w-0"><div className="text-[13px] font-bold text-red">Geçmiş bakım bildirimi</div><div className="text-[11px] text-muted mt-0.5">{counts.gecikmis} bakım gecikmiş durumda.</div></div>
            {canAccessRoute(user?.role, "/bildirimler") && <Link href="/bildirimler" className="flex-shrink-0 px-3 py-2 rounded-lg bg-red text-white text-[11px] font-extrabold hover:brightness-110 transition">Bildirimlere git →</Link>}
          </div>
        )}

        <DashboardAssistant />


        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor yük özeti</h2>
        <div className="flex gap-4 text-xs text-muted mb-2"><span>Toplam <b className="text-text font-mono">{totalLoad.toLocaleString("tr-TR")}</b> kW</span><span>Ort. <b className="text-text font-mono">{avgLoad.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</b> kW</span></div>
        <LoadCards engines={sortedEngines} />


        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor Sağlık Puanı</h2>
        <p className="mb-3 text-[10.5px] text-muted">Bir motora dokunarak tüm bakım türlerindeki kalan ve çalışılan saatleri görüntüleyebilirsin.</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 mb-5">
          {healthRows.map(({ engine, score, status, attention }) => {
            const statusView = ENGINE_STATUS_VIEW[status];
            const selected = selectedHealthEngineId === engine._id;
            const engineItems = items.filter((item) => item.engine_id === engine._id);
            return <div key={engine._id} className="flex flex-col gap-2">
              <button type="button" onClick={() => setSelectedHealthEngineId(selected ? "" : engine._id)} aria-expanded={selected} className={`rounded-xl border bg-panel p-3 text-left transition hover:border-amber/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${selected ? "border-amber shadow-lg shadow-amber/10" : "border-border"}`}>
                <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 truncate text-[12px] font-bold text-text"><span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusView.dot}`} aria-hidden="true" />{engine.name}</span><span className={`font-mono text-lg font-extrabold ${statusView.text}`}>%{score}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full bg-gradient-to-r ${statusView.bar}`} style={{ width: `${score}%` }} /></div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px]"><span className={statusView.text}>{statusView.label}</span><span className="text-faint">{attention ? `${attention} bakım maddesi dikkat istiyor` : "Tüm bakım maddeleri normal"}</span></div>
              </button>
              {selected && <EngineHealthDetails engine={engine} items={engineItems} onClose={() => setSelectedHealthEngineId("")} />}
            </div>;
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
