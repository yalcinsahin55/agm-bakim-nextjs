"use client";

import { STATUS_LABELS, STATUS_COLORS } from "@/lib/status";

const ICONS = {
  gecikmis: "⏰",
  kritik: "⚠️",
  yaklasiyor: "⏳",
  normal: "✅",
};

export default function StatCards({ counts }) {
  const order = ["gecikmis", "kritik", "yaklasiyor", "normal"];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-1">
      {order.map((key) => (
        <div
          key={key}
          className="relative overflow-hidden bg-panel border border-border rounded-card p-3 md:p-4 transition-all hover:border-borderlt hover:-translate-y-0.5"
        >
          <div className="absolute left-0 top-0 w-[3px] h-full" style={{ background: STATUS_COLORS[key] }} />
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-bold tracking-wide text-muted uppercase">{STATUS_LABELS[key]}</div>
            <span className="text-sm">{ICONS[key]}</span>
          </div>
          <div className="font-mono text-2xl md:text-3xl font-bold mt-1" style={{ color: STATUS_COLORS[key] }}>
            {counts[key]}
          </div>
        </div>
      ))}
    </div>
  );
}
