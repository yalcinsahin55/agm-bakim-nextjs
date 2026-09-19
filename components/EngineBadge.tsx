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
      className="rounded-xl flex items-center justify-center bg-amber/10 border border-amber/30 font-mono font-extrabold text-amber shadow-sm shadow-amber/10 flex-shrink-0"
    >
      {num}
    </div>
  );
}
