import { engineSortKey } from "@/lib/status";

export default function EngineBadge({ name, size = 32 }) {
  const num = engineSortKey(name);
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className="rounded-[9px] flex items-center justify-center bg-gradient-to-br from-[#232d3a] to-panel border border-border font-mono font-bold text-amber flex-shrink-0"
    >
      {num}
    </div>
  );
}
