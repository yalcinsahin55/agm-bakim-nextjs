"use client";

import { useEffect, useMemo, useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import LoadCards from "@/components/LoadCards";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { cachedFetch } from "@/lib/apiCache";
import { usePageData } from "@/lib/usePageData";
import { engineSortKey, type PanelItem, type StatusKey } from "@/lib/status";
import DashboardActionRail from "@/components/DashboardActionRail";
import { Badge, Button, Card } from "@/components/ui";
import DashboardAssistant from "./_components/DashboardAssistant";
import EngineHealthDetails from "./_components/EngineHealthDetails";
import { ENGINE_STATUS_VIEW, engineStatus, greetingPresentation, healthCardId } from "./_lib/types";
import type { DashboardEngine, PanelResponse } from "./_lib/types";

interface DashboardPanelData {
  items: PanelItem[];
  engines: DashboardEngine[];
}

const EMPTY_PANEL_DATA: DashboardPanelData = { items: [], engines: [] };

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const [selectedHealthEngineId, setSelectedHealthEngineId] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const { data: panelData, loading, error, refreshing, reload } = usePageData<DashboardPanelData>(
    async () => {
      const panel = await cachedFetch<PanelResponse>("/api/maintenance-types/panel", 15_000);
      return {
        items: Array.isArray(panel.items) ? panel.items : [],
        engines: Array.isArray(panel.engines) ? panel.engines : [],
      };
    },
    EMPTY_PANEL_DATA,
    [],
    "Dashboard verileri yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  );
  const { items, engines } = panelData;

  useEffect(() => {
    const requestedEngine = new URLSearchParams(window.location.search).get("engine")?.trim();
    if (requestedEngine) setSelectedHealthEngineId(requestedEngine);
  }, []);

  useEffect(() => {
    if (loading || !selectedHealthEngineId) return;
    const target = document.getElementById(healthCardId(selectedHealthEngineId));
    if (!target) return;
    const timer = window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => window.clearTimeout(timer);
  }, [loading, selectedHealthEngineId]);

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
  const healthRows = useMemo(() => {
    const itemsByEngine = new Map<string, PanelItem[]>();
    items.forEach((item) => {
      const engineItems = itemsByEngine.get(item.engine_id) || [];
      engineItems.push(item);
      itemsByEngine.set(item.engine_id, engineItems);
    });
    return sortedEngines.map((engine) => {
      const engineItems = itemsByEngine.get(engine._id) || [];
      const penalty = engineItems.reduce((sum, item) => sum + (item.status === "gecikmis" ? 25 : item.status === "kritik" ? 15 : item.status === "yaklasiyor" ? 5 : 0), 0);
      const score = Math.max(0, Math.min(100, 100 - penalty));
      return { engine, score, status: engineStatus(engineItems), attention: engineItems.filter((item) => item.status !== "normal").length };
    });
  }, [items, sortedEngines]);
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
          <Card className="mb-4 border-red/40 bg-red/10 p-3.5 text-[12px] text-red" role="alert">
            <div className="font-bold">{error}</div>
            <Button type="button" onClick={() => void reload()} variant="danger" size="sm" className="mt-2 border-red bg-red text-white" disabled={refreshing}>
              {refreshing ? "Yenileniyor..." : "Tekrar dene"}
            </Button>
          </Card>
        )}

        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted">Bakım durumu ve motor özetleri</div>
          <Button
            type="button"
            onClick={() => void reload()}
            disabled={refreshing}
            variant="secondary"
            size="sm"
          >
            {refreshing ? "Yenileniyor..." : "↻ Yenile"}
          </Button>
        </div>

        <Card className={`mb-4 p-4 animate-fade-in ${greetingView.panelClass}`}>
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
            <Badge tone="success" dot>Sistem aktif</Badge>
          </div>
        </Card>

        <DashboardActionRail
          role={user?.role}
          enginesCount={sortedEngines.length}
          counts={counts}
          items={items}
          healthRows={healthRows}
        />

        <DashboardAssistant />


        <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor yük özeti</h2>
        <div className="flex gap-4 text-xs text-muted mb-2"><span>Toplam <b className="text-text font-mono">{totalLoad.toLocaleString("tr-TR")}</b> kW</span><span>Ort. <b className="text-text font-mono">{avgLoad.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</b> kW</span></div>
        <LoadCards engines={sortedEngines} />


        <section id="dashboard-health-details" className="scroll-mt-24">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide mt-5 mb-3 border-b border-border pb-2">Motor Bakım Durumu</h2>
          <p className="mb-3 text-[10.5px] text-muted">Bir motora dokunarak tüm bakım türlerindeki kalan ve çalışılan saatleri görüntüleyebilirsin.</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 mb-5">
          {healthRows.map(({ engine, score, status, attention }) => {
            const statusView = ENGINE_STATUS_VIEW[status];
            const selected = selectedHealthEngineId === engine._id;
            const engineItems = items.filter((item) => item.engine_id === engine._id);
            return <div id={healthCardId(engine._id)} key={engine._id} className="flex scroll-mt-24 flex-col gap-2">
              <button type="button" onClick={() => setSelectedHealthEngineId(selected ? "" : engine._id)} aria-expanded={selected} className={`rounded-xl border bg-panel p-3 text-left transition hover:border-amber/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${selected ? "border-amber shadow-lg shadow-amber/10" : "border-border"}`}>
                <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 truncate text-[12px] font-bold text-text"><span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusView.dot}`} aria-hidden="true" />{engine.name}</span><span className={`font-mono text-lg font-extrabold ${statusView.text}`}>%{score}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full bg-gradient-to-r ${statusView.bar}`} style={{ width: `${score}%` }} /></div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px]"><span className={statusView.text}>{statusView.label}</span><span className="text-faint">{attention ? `${attention} bakım maddesi dikkat istiyor` : "Tüm bakım maddeleri normal"}</span></div>
              </button>
              {selected && <EngineHealthDetails engine={engine} items={engineItems} onClose={() => setSelectedHealthEngineId("")} />}
            </div>;
          })}
          </div>
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
