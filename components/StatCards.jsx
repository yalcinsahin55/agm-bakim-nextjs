import { STATUS_LABELS, STATUS_COLORS } from "@/lib/status";

export default function StatCards({ counts }) {
  const order = ["gecikmis", "kritik", "yaklasiyor", "normal"];
  return (
    <div className="flex gap-2 flex-wrap mb-1">
      {order.map((key) => (
        <div key={key} className="flex-1 min-w-[100px] relative overflow-hidden bg-panel border border-border rounded-card p-3">
          <div className="absolute left-0 top-0 w-[3px] h-full" style={{ background: STATUS_COLORS[key] }} />
          <div className="text-[10.5px] font-bold tracking-wide text-muted uppercase">{STATUS_LABELS[key]}</div>
          <div className="font-mono text-2xl font-bold mt-1" style={{ color: STATUS_COLORS[key] }}>{counts[key]}</div>
        </div>
      ))}
    </div>
  );
}
