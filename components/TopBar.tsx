import type { ReactNode } from "react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export default function TopBar({ title, subtitle, right }: TopBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-[#0f1319]/95 backdrop-blur-md border-b border-border px-4 pt-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mobilde logo göster, PC'de sidebar'da zaten var */}
          <div className="md:hidden w-9 h-9 rounded-xl bg-gradient-to-br from-[#232d3a] to-panel border border-border flex items-center justify-center text-base flex-shrink-0 shadow">
            🔧
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-bold uppercase tracking-wide truncate">{title}</div>
            {subtitle && <div className="text-[10.5px] text-faint mt-0.5 truncate">{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}
