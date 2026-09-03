import { engineSortKey } from "@/lib/status";

interface EngineBadgeProps {
  name: string;
  size?: number;
}

export default function EngineBadge({ name, size = 32 }: EngineBadgeProps) {
  const num = engineSortKey(name);
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className="rounded-[9px] flex items-center justify-center bg-gradient-to-br from-panel to-panel border border-border font-mono font-bold text-amber flex-shrink-0"
    >
      {num}
    </div>
  );
}
