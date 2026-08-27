import type { ChartPoint } from "../_lib/types";

export default function MiniLineChart({ points, color = "#e8952f", label = "" }: { points: ChartPoint[]; color?: string; label?: string }) {
  if (points.length < 2) return null;
  const w = 400, h = 140, pad = 15;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;

  const path = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((point.y - minY) / range) * (h - pad * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
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
        {points.map((point, index) => {
          const x = pad + (index / (points.length - 1)) * (w - pad * 2);
          const y = h - pad - ((point.y - minY) / range) * (h - pad * 2);
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <title>{`${point.label || index + 1}: ${point.y.toLocaleString("tr-TR")}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
