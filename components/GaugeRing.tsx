interface GaugeRingProps {
  remaining: number;
  period: number;
  color: string;
  size?: number;
}

export default function GaugeRing({ remaining, period, color, size = 44 }: GaugeRingProps) {
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const pct = period ? Math.max(0, Math.min(1, remaining / period)) : 0;
  const dash = circumference * pct;

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2a323c" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference} strokeDashoffset={circumference - dash}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .4s ease" }}
      />
    </svg>
  );
}
