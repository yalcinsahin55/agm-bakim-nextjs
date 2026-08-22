import EngineBadge from "./EngineBadge";
interface LoadEngine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface LoadCardsProps {
  engines: LoadEngine[];
}

export default function LoadCards({ engines }: LoadCardsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 md:grid md:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] md:overflow-visible">
      {engines.map((e) => (
        <div
          key={e._id}
          className="flex flex-col items-center gap-1 flex-shrink-0 w-[74px] md:w-auto p-2.5 rounded-xl bg-panel border border-border transition-all hover:border-borderlt hover:-translate-y-0.5"
        >
          <EngineBadge name={e.name} size={28} />
          <span className="text-[10px] text-muted font-semibold">{e.name}</span>
          <span className="font-mono text-[13px] text-teal font-bold">{(e.load_kw || 0).toLocaleString("tr-TR")}</span>
          <span className="text-[8px] text-faint tracking-wide">kW</span>
        </div>
      ))}
    </div>
  );
}
