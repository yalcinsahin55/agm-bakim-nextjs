import EngineBadge from "./EngineBadge";
import { memo } from "react";
interface LoadEngine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface LoadCardsProps {
  engines: LoadEngine[];
}

export default memo(function LoadCards({ engines }: LoadCardsProps) {
  const maxLoad = Math.max(...engines.map((engine) => Number(engine.load_kw || 0)), 1);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {engines.map((e) => (
        <div
          key={e._id}
          className="group flex min-w-0 flex-col gap-2 rounded-control border border-border bg-panel p-3 transition-all hover:-translate-y-0.5 hover:border-borderlt"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 truncate text-[11px] font-extrabold text-text"><EngineBadge name={e.name} size={24} />{e.name}</span>
            <span className="font-mono text-[13px] font-extrabold text-teal">{(e.load_kw || 0).toLocaleString("tr-TR")}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-gradient-to-r from-teal to-amber-bright transition-all group-hover:brightness-110" style={{ width: `${Math.max(4, (Number(e.load_kw || 0) / maxLoad) * 100)}%` }} /></div>
          <div className="flex items-center justify-between text-[9px] text-faint"><span>kW yük</span><span>{Number(e.hours || 0).toLocaleString("tr-TR")} saat</span></div>
        </div>
      ))}
    </div>
  );
});
