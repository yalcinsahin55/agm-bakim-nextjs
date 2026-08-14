import EngineBadge from "./EngineBadge";

export default function LoadCards({ engines }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {engines.map((e) => (
        <div key={e._id} className="flex flex-col items-center gap-1 flex-shrink-0 w-[74px] p-2.5 rounded-xl bg-panel border border-border">
          <EngineBadge name={e.name} size={28} />
          <span className="text-[10px] text-muted font-semibold">{e.name}</span>
          <span className="font-mono text-[13px] text-teal font-bold">{(e.load_kw || 0).toLocaleString("tr-TR")}</span>
          <span className="text-[8px] text-faint tracking-wide">kW</span>
        </div>
      ))}
    </div>
  );
}
