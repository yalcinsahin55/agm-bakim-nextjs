import Link from "next/link";
import { canAccessRoute } from "@/lib/permissions";
import type { StatusKey } from "@/lib/status";

import type { JSX } from "react";

type DashboardActionRailProps = {
  role: string | undefined;
  enginesCount: number;
  counts: Record<StatusKey, number>;
};

type ActionTone = "amber" | "teal" | "purple" | "red";

type DashboardAction = {
  href: string;
  label: string;
  description: string;
  icon: string;
  tone: ActionTone;
  meta: (props: DashboardActionRailProps) => string;
};

const ACTIONS: DashboardAction[] = [
  {
    href: "/tamamla",
    label: "Bakım tamamla",
    description: "Saha kaydını başlat veya QR ile gelen akışı aç.",
    icon: "✓",
    tone: "amber",
    meta: () => "Yazma yetkisi gereken ekran",
  },
  {
    href: "/kayitlar",
    label: "Bakım kayıtları",
    description: "Son kayıtları, kanıtları ve motor geçmişini incele.",
    icon: "▤",
    tone: "teal",
    meta: ({ counts }) => `${counts.gecikmis} gecikmiş kayıt durumu`,
  },
  {
    href: "/motorlar",
    label: "Motor durumları",
    description: "Motor sağlığını ve bakım geçmişini motor bazında aç.",
    icon: "⚙",
    tone: "purple",
    meta: ({ enginesCount }) => `${enginesCount} motor izleniyor`,
  },
  {
    href: "/bildirimler",
    label: "Bildirim merkezi",
    description: "Dikkat isteyen bakım durumlarını ve son olayları kontrol et.",
    icon: "!",
    tone: "red",
    meta: ({ counts }) => `${counts.gecikmis + counts.kritik + counts.yaklasiyor} dikkat isteyen madde`,
  },
];

const TONE_CLASSES: Record<ActionTone, { icon: string; title: string }> = {
  amber: { icon: "border-amber/30 bg-amber/10 text-amber", title: "group-hover:text-amber" },
  teal: { icon: "border-teal/30 bg-teal/10 text-teal", title: "group-hover:text-teal" },
  purple: { icon: "border-purple-400/30 bg-purple-400/10 text-purple-200", title: "group-hover:text-purple-200" },
  red: { icon: "border-red/30 bg-red/10 text-red", title: "group-hover:text-red" },
};

export default function DashboardActionRail(props: DashboardActionRailProps): JSX.Element {
  const visibleActions = ACTIONS.filter((action) => canAccessRoute(props.role, action.href));

  if (!visibleActions.length) return <></>;

  return (
    <section className="mb-5" aria-labelledby="dashboard-actions-heading">
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Operasyon merkezi</div>
          <h2 id="dashboard-actions-heading" className="mt-1 font-display text-lg font-bold uppercase tracking-wide text-text">Sıradaki iş</h2>
        </div>
        <span className="text-right text-[9.5px] text-faint">Yalnızca yetkili ekranlar</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {visibleActions.map((action) => {
          const tone = TONE_CLASSES[action.tone];
          return (
            <Link key={action.href} href={action.href} className="group flex min-h-[112px] min-w-0 flex-col justify-between rounded-xl border border-border bg-panel p-3 transition hover:border-borderlt hover:bg-panel2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
              <div className="flex items-start gap-2.5">
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-sm font-extrabold ${tone.icon}`} aria-hidden="true">{action.icon}</span>
                <span className="min-w-0">
                  <span className={`block truncate text-[12px] font-extrabold text-text ${tone.title}`}>{action.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-muted">{action.description}</span>
                </span>
              </div>
              <span className="mt-3 flex items-center justify-between gap-2 text-[9.5px] font-bold text-faint"><span className="truncate">{action.meta(props)}</span><span aria-hidden="true">→</span></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
