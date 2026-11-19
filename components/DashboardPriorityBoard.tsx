"use client";

import Link from "next/link";
import type { PanelItem, StatusKey } from "@/lib/status";

const STATUS_ORDER: StatusKey[] = ["gecikmis", "kritik", "yaklasiyor", "normal"];
const STATUS_VIEW: Record<StatusKey, { label: string; dot: string; badge: string }> = {
  gecikmis: { label: "Gecikmiş", dot: "bg-red", badge: "bg-red/10 text-red" },
  kritik: { label: "Kritik", dot: "bg-orange", badge: "bg-orange/10 text-orange" },
  yaklasiyor: { label: "Yaklaşıyor", dot: "bg-amber", badge: "bg-amber/10 text-amber" },
  normal: { label: "Normal", dot: "bg-green", badge: "bg-green/10 text-green" },
};

function statusText(item: PanelItem): string {
  if (item.remaining <= 0) return `${Math.abs(item.remaining).toLocaleString("tr-TR")} saat gecikmiş`;
  return `${item.remaining.toLocaleString("tr-TR")} saat kaldı`;
}

export default function DashboardPriorityBoard({ items }: { items: PanelItem[] }) {
  const priorityItems = [...items]
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.remaining - b.remaining)
    .slice(0, 4);
  const overdueCount = items.filter((item) => item.status === "gecikmis").length;

  return (
    <section className="mb-5 rounded-card border border-border bg-panel p-4 shadow-lg shadow-black/10" aria-labelledby="dashboard-priority-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="app-kicker">Bugünün öncelikleri</div>
          <h2 id="dashboard-priority-heading" className="app-section-title mt-1">Önce bunlara bak</h2>
          <p className="mt-1 text-[11px] text-muted">En acil bakım maddeleri durum ve kalan saate göre sıralandı.</p>
        </div>
        <div className="rounded-full border border-border bg-panel2 px-2.5 py-1 text-[10px] font-bold text-faint">
          {overdueCount ? `${overdueCount} gecikmiş madde` : "Acil madde yok"}
        </div>
      </div>

      {priorityItems.length ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {priorityItems.map((item) => {
            const view = STATUS_VIEW[item.status];
            return (
              <div key={`${item.engine_id}-${item.type_key}`} className="group flex min-w-0 items-center gap-3 rounded-control border border-border bg-panel2/70 p-3 transition hover:border-borderlt">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${view.dot} shadow-[0_0_0_4px_color-mix(in_srgb,currentColor_14%,transparent)]`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-extrabold text-text">{item.engine_name} · {item.type_label}</div>
                  <div className="mt-1 truncate text-[10px] text-muted">{item.engine_hours.toLocaleString("tr-TR")} saat · Periyot {item.period.toLocaleString("tr-TR")} saat</div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${view.badge}`}>{statusText(item)}</span>
                  <Link href={`/dashboard?engine=${encodeURIComponent(item.engine_id)}`} className="text-[9px] font-bold text-teal opacity-80 transition group-hover:opacity-100 hover:underline">Motoru aç →</Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-control border border-green/25 bg-green/5 px-3 py-4 text-[11px] text-muted">Şu anda öncelik gerektiren bakım maddesi bulunmuyor.</div>
      )}
    </section>
  );
}
