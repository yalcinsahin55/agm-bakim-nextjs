import type { ChartPoint } from "./types";

export default function MiniLineChart({ points, color = "var(--color-amber)", label = "" }: { points: ChartPoint[]; color?: string; label?: string }) {
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
              <title>{`${p.label || i + 1}: ${p.y.toLocaleString("tr-TR")} bar`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
