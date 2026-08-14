"use client";

import GaugeRing from "./GaugeRing";
import EngineBadge from "./EngineBadge";
import StatusPill from "./StatusPill";
import { STATUS_COLORS } from "@/lib/status";

/**
 * rows: { title, subtitle, status, remaining, period, valueLabel, unitLabel, badgeName? }[]
 * Her satırı gösterge halkalı, durum renkli bir kart olarak çizer.
 */
export default function GaugeCardList({ rows, onCardClick }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">
        Kayıt bulunamadı.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, idx) => {
        const color = STATUS_COLORS[r.status];
        const Wrapper = onCardClick ? "button" : "div";
        return (
          <Wrapper
            key={r.key || idx}
            onClick={onCardClick ? () => onCardClick(r) : undefined}
            className={`flex items-center gap-3 bg-panel border border-border rounded-card p-3 text-left w-full ${onCardClick ? "cursor-pointer active:opacity-80" : ""}`}
          >
            {r.badgeName && <EngineBadge name={r.badgeName} />}
            <GaugeRing remaining={r.remaining} period={r.period} color={color} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-text">{r.title}</div>
              <div className="text-[11px] text-faint mt-0.5">{r.subtitle}</div>
              <div className="mt-1"><StatusPill status={r.status} /></div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono font-bold text-sm" style={{ color }}>{r.valueLabel}</div>
              <div className="text-[9px] text-faint tracking-wide">{r.unitLabel}</div>
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
