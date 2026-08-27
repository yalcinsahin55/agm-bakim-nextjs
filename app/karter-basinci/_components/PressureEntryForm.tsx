import type { PressureEngine, PressureEntry } from "./types";

type PressureEntryField = "maint" | "load_kw" | "pressure_bar";

interface PressureEntryFormProps {
  engines: PressureEngine[];
  entries: Record<string, PressureEntry>;
  readingDate: string;
  onReadingDateChange: (value: string) => void;
  onEntryChange: (engineId: string, field: PressureEntryField, value: boolean | string) => void;
}

export default function PressureEntryForm({ engines, entries, readingDate, onReadingDateChange, onEntryChange }: PressureEntryFormProps) {
  return (
    <div className="animate-fade-in">
      <input
        type="date"
        value={readingDate}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(event) => onReadingDateChange(event.target.value)}
        className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
      />

      <p className="text-[11px] text-faint mb-3">Her motor için yük ve fark basıncını girin, bakımda/yedek olanları işaretleyin.</p>
      <div className="flex flex-col gap-2 mb-40">
        {engines.map((engine) => {
          const entry = entries[engine._id] || {};
          return (
            <div key={engine._id} className="bg-panel border border-border rounded-card p-3 hover:border-borderlt transition-all hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-bold text-text">{engine.name}</span>
                <label className="flex items-center gap-1.5 text-[10.5px] text-muted cursor-pointer hover:text-text transition">
                  <input
                    type="checkbox"
                    checked={!!entry.maint}
                    onChange={(event) => onEntryChange(engine._id, "maint", event.target.checked)}
                    className="rounded border-border"
                  />
                  Bakımda/Yedek
                </label>
              </div>
              {!entry.maint && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Yük (kW)"
                    value={entry.load_kw ?? ""}
                    onChange={(event) => onEntryChange(engine._id, "load_kw", event.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Fark Basıncı (bar)"
                    value={entry.pressure_bar ?? ""}
                    onChange={(event) => onEntryChange(engine._id, "pressure_bar", event.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
