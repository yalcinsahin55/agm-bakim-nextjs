"use client";

import Link from "next/link";
import { useMemo, useState, type JSX } from "react";
import { canAccessRoute, canWriteMaintenance, normalizeRole } from "@/lib/permissions";
import type { PanelItem, StatusKey } from "@/lib/status";
import { STATUS_LABELS } from "@/lib/status";
import { buildOperationQueue, filterOperationItems } from "@/app/dashboard/_lib/operationQueue";
import { ENGINE_STATUS_VIEW, type DashboardHealthRow } from "@/app/dashboard/_lib/types";

type DashboardActionRailProps = {
  role: string | undefined;
  enginesCount: number;
  counts: Record<StatusKey, number>;
  items: PanelItem[];
  healthRows: DashboardHealthRow[];
};

type ActionTone = "amber" | "teal" | "purple" | "red";
type QueueFilter = "all" | StatusKey;

type QuickAction = {
  href: string;
  accessPath?: string;
  label: string;
  description: string;
  icon: string;
  tone: ActionTone;
};

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/tamamla", label: "Bakım tamamla", description: "Saha kaydını başlat.", icon: "✓", tone: "amber" },
  { href: "/kayitlar", label: "Bakım kayıtları", description: "Kayıt ara, geçmiş kanıtları incele.", icon: "▤", tone: "teal" },
  { href: "#dashboard-health-details", accessPath: "/dashboard", label: "Motor sağlığı", description: "Motor sağlık detaylarına git.", icon: "⚙", tone: "purple" },
  { href: "/bakim-turleri", label: "Bakım türleri", description: "Tür bazında tüm motorları listele.", icon: "▦", tone: "purple" },
  { href: "/bildirimler", label: "Bildirim merkezi", description: "Dikkat isteyen son olayları aç.", icon: "!", tone: "red" },
];

const TONE_CLASSES: Record<ActionTone, { icon: string; title: string }> = {
  amber: { icon: "border-amber/30 bg-amber/10 text-amber", title: "group-hover:text-amber" },
  teal: { icon: "border-teal/30 bg-teal/10 text-teal", title: "group-hover:text-teal" },
  purple: { icon: "border-purple-400/30 bg-purple-400/10 text-purple-200", title: "group-hover:text-purple-200" },
  red: { icon: "border-red/30 bg-red/10 text-red", title: "group-hover:text-red" },
};

const FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: "all", label: "Tümü" },
  { key: "gecikmis", label: "Gecikmiş" },
  { key: "kritik", label: "Kritik" },
  { key: "yaklasiyor", label: "Yaklaşıyor" },
];

function rolePresentation(role: string | undefined): { title: string; description: string; badge: string } {
  if (normalizeRole(role) === "goruntuleyici") {
    return {
      title: "İzleme kokpiti",
      description: "Öncelikleri, motor sağlığını ve bakım geçmişini güvenli biçimde incele.",
      badge: "YALNIZCA İZLEME",
    };
  }
  return {
    title: "Günlük operasyon",
    description: "Bugünün önceliklerini gör, gerekli bakım akışına doğrudan geç.",
    badge: "AKSİYON ODAKLI",
  };
}

function queueStatusText(item: PanelItem): string {
  if (item.remaining <= 0) return `${Math.abs(item.remaining).toLocaleString("tr-TR")} saat gecikmiş`;
  return `${item.remaining.toLocaleString("tr-TR")} saat kaldı`;
}

function queueStatusClass(status: StatusKey): string {
  if (status === "gecikmis") return "bg-red/10 text-red";
  if (status === "kritik") return "bg-orange/10 text-orange";
  if (status === "yaklasiyor") return "bg-amber/10 text-amber";
  return "bg-green/10 text-green";
}

function queueAction(role: string | undefined, item: PanelItem): { href: string; label: string } {
  if (canWriteMaintenance(role) && canAccessRoute(role, "/tamamla")) {
    return {
      href: `/tamamla?engine_id=${encodeURIComponent(item.engine_id)}&type_key=${encodeURIComponent(item.type_key)}`,
      label: "Bakımı tamamla",
    };
  }
  if (canAccessRoute(role, "/kayitlar")) return { href: "/kayitlar", label: "Kayıtları gör" };
  return { href: `/dashboard?engine=${encodeURIComponent(item.engine_id)}`, label: "Motor detayını aç" };
}

function compareHealthRows(left: DashboardHealthRow, right: DashboardHealthRow): number {
  const statusOrder: Record<StatusKey, number> = { gecikmis: 0, kritik: 1, yaklasiyor: 2, normal: 3 };
  const statusDifference = statusOrder[left.status] - statusOrder[right.status];
  if (statusDifference !== 0) return statusDifference;
  if (left.score !== right.score) return left.score - right.score;
  if (left.attention !== right.attention) return right.attention - left.attention;
  return left.engine.name.localeCompare(right.engine.name, "tr", { numeric: true, sensitivity: "base" });
}

function EngineRiskRow({ row }: { row: DashboardHealthRow }): JSX.Element {
  const statusView = ENGINE_STATUS_VIEW[row.status];
  return (
    <div className="flex items-center gap-2 border-b border-border/70 py-2 last:border-0">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusView.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10.5px] font-bold text-text">{row.engine.name}</div>
        <div className="mt-0.5 truncate text-[9px] text-faint">
          {row.engine.hours.toLocaleString("tr-TR")} saat · {Number(row.engine.load_kw || 0).toLocaleString("tr-TR")} kW
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className={`font-mono text-[11px] font-extrabold ${statusView.text}`}>%{row.score}</div>
        <div className="text-[8.5px] text-faint">{row.attention ? `${row.attention} uyarı` : STATUS_LABELS[row.status]}</div>
      </div>
    </div>
  );
}

export default function DashboardActionRail(props: DashboardActionRailProps): JSX.Element {
  const { role, enginesCount, counts, items, healthRows } = props;
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const presentation = rolePresentation(role);
  const viewerMode = normalizeRole(role) === "goruntuleyici";
  const filteredItems = useMemo(() => filterOperationItems(items, queueFilter), [items, queueFilter]);
  const operationQueue = useMemo(() => buildOperationQueue(filteredItems, 6), [filteredItems]);
  const riskRows = useMemo(() => [...healthRows].sort(compareHealthRows).slice(0, 5), [healthRows]);
  const visibleActions = QUICK_ACTIONS.filter((action) => canAccessRoute(props.role, action.accessPath || action.href));

  if (!visibleActions.length && !operationQueue.length && !riskRows.length) return <></>;

  return (
    <section className="mb-5" aria-labelledby="dashboard-actions-heading">
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Operasyon merkezi</div>
          <h2 id="dashboard-actions-heading" className="mt-1 font-display text-lg font-bold uppercase tracking-wide text-text">Sıradaki iş</h2>
          <p className="mt-1 max-w-2xl text-[10.5px] leading-4 text-muted">{presentation.description}</p>
        </div>
        <span className={`flex-shrink-0 rounded-full border px-2 py-1 text-right text-[8.5px] font-extrabold tracking-wide ${viewerMode ? "border-teal/30 bg-teal/10 text-teal" : "border-amber/30 bg-amber/10 text-amber"}`}>
          {presentation.badge}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label={`${presentation.title} özeti`}>
        {FILTERS.map((filter) => {
          const value = filter.key === "all" ? items.length : counts[filter.key];
          const selected = queueFilter === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setQueueFilter(selected ? "all" : filter.key)}
              aria-pressed={selected}
              className={`rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${selected ? "border-amber/60 bg-amber/10" : "border-border bg-panel hover:border-borderlt"}`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wide text-faint">{filter.label}</div>
              <div className="mt-1 font-mono text-xl font-extrabold text-text">{value}</div>
              <div className="mt-0.5 text-[8.5px] text-muted">{filter.key === "all" ? "bakım maddesi" : "öncelikli madde"}</div>
            </button>
          );
        })}
        <Link href="#dashboard-health-details" className="rounded-xl border border-border bg-panel px-3 py-2 text-left transition hover:border-borderlt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
          <div className="text-[9px] font-bold uppercase tracking-wide text-faint">İzlenen motor</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-text">{enginesCount}</div>
          <div className="mt-0.5 text-[8.5px] text-muted">motor özeti</div>
        </Link>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.9fr)]">
        <div className="rounded-xl border border-border bg-panel p-3" aria-label="Öncelikli aksiyon kuyruğu">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-text">Aksiyon kuyruğu</div>
              <div className="mt-0.5 text-[9px] text-faint">En acil bakım maddeleri önce gösterilir.</div>
            </div>
            <span className="font-mono text-[9px] text-faint">{operationQueue.length}/{filteredItems.length}</span>
          </div>

          {operationQueue.length > 0 ? (
            <div className="grid gap-1.5">
              {operationQueue.map((item) => {
                const action = queueAction(role, item);
                return (
                  <div key={`${item.engine_id}-${item.type_key}`} className="flex flex-col gap-2 rounded-lg border border-border/80 bg-panel2 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="break-words text-[10.5px] font-bold text-text">{item.engine_name} · {item.type_label}</div>
                      <div className="mt-0.5 text-[9px] text-faint">Motor: {item.engine_hours.toLocaleString("tr-TR")} saat · Periyot: {item.period.toLocaleString("tr-TR")} saat</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:justify-end">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${queueStatusClass(item.status)}`}>{queueStatusText(item)}</span>
                      <Link href={action.href} className="rounded-lg border border-border px-2 py-1.5 text-[9px] font-extrabold text-text transition hover:border-amber/50 hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">{action.label} →</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-green/25 bg-green/5 px-3 py-3 text-[10px] text-muted">
              {queueFilter === "all" ? "Şu anda gösterilecek bakım maddesi bulunmuyor." : `${STATUS_LABELS[queueFilter]} durumunda bakım maddesi bulunmuyor.`}
            </div>
          )}
          {filteredItems.length > operationQueue.length && <Link href="/araliklar" className="mt-2 inline-flex text-[9.5px] font-bold text-teal hover:underline">Tüm bakım planını aç →</Link>}
        </div>

        <div id="dashboard-risk-summary" className="rounded-xl border border-border bg-panel p-3" aria-label="Motor risk özeti">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-text">Motor risk özeti</div>
              <div className="mt-0.5 text-[9px] text-faint">En çok dikkat isteyen motorlar.</div>
            </div>
            <span className="font-mono text-[9px] text-faint">{enginesCount} motor</span>
          </div>
          {riskRows.length > 0 ? <div>{riskRows.map((row) => <EngineRiskRow key={row.engine._id} row={row} />)}</div> : <div className="rounded-lg border border-border bg-panel2 px-3 py-3 text-[10px] text-muted">Motor risk özeti için veri bulunamadı.</div>}
          {canAccessRoute(role, "/motorlar") && <Link href="/motorlar" className="mt-2 inline-flex text-[9.5px] font-bold text-teal hover:underline">Tüm motorları aç →</Link>}
        </div>
      </div>

      {visibleActions.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-faint">Hızlı işlemler</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {visibleActions.map((action) => {
              const tone = TONE_CLASSES[action.tone];
              return (
                <Link key={action.href} href={action.href} className="group flex min-h-[78px] min-w-0 items-center gap-2.5 rounded-xl border border-border bg-panel p-3 transition hover:border-borderlt hover:bg-panel2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-sm font-extrabold ${tone.icon}`} aria-hidden="true">{action.icon}</span>
                  <span className="min-w-0">
                    <span className={`block break-words text-[11px] font-extrabold text-text ${tone.title}`}>{action.label}</span>
                    <span className="mt-1 block text-[9px] leading-4 text-muted">{action.description}</span>
                  </span>
                  <span className="ml-auto flex-shrink-0 text-[12px] text-faint" aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export type { DashboardActionRailProps };
