interface EngineAddFormProps {
  name: string;
  hours: string;
  load: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onHoursChange: (value: string) => void;
  onLoadChange: (value: string) => void;
  maintenanceOptions: Array<{ key: string; label: string; default_period_hours: number }>;
  assignments: Record<string, { selected: boolean; period: string }>;
  onAssignmentChange: (key: string, change: { selected?: boolean; period?: string }) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export default function EngineAddForm({ name, hours, load, saving, onNameChange, onHoursChange, onLoadChange, maintenanceOptions, assignments, onAssignmentChange, onSubmit }: EngineAddFormProps) {
  return (
    <form onSubmit={onSubmit} className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
      <div className="text-[12px] font-bold text-teal mb-2"> Yeni Motor Ekle</div>
      <div className="flex flex-col gap-2">
        <input
          required placeholder="Motor adı (örn. Motor 7)" value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number" placeholder="Güncel saat" value={hours}
            onChange={(event) => onHoursChange(event.target.value)}
            className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
          />
          <input
            type="number" placeholder="Yük (kW)" value={load}
            onChange={(event) => onLoadChange(event.target.value)}
            className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
          />
        </div>
        <div className="mt-2 rounded-control border border-border bg-panel2/70 p-3">
          <div className="mb-1 text-[11px] font-extrabold text-text">Takip edilecek bakımlar</div>
          <p className="mb-3 text-[10px] leading-relaxed text-muted">Motor kaydedildiğinde seçilen bakım türleri ve periyotları otomatik atanır.</p>
          {maintenanceOptions.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {maintenanceOptions.map((option) => {
                const assignment = assignments[option.key] || { selected: false, period: String(option.default_period_hours || "") };
                return (
                  <label key={option.key} className={`flex items-center gap-2 rounded-lg border p-2.5 transition ${assignment.selected ? "border-teal/50 bg-teal/10" : "border-border bg-panel"}`}>
                    <input type="checkbox" checked={assignment.selected} onChange={(event) => onAssignmentChange(option.key, { selected: event.target.checked })} className="h-4 w-4 accent-teal" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-text">{option.label}</span>
                    <input type="number" min="0" step="1" aria-label={`${option.label} periyodu`} value={assignment.period} onChange={(event) => onAssignmentChange(option.key, { period: event.target.value })} className="w-20 rounded-lg border border-border bg-panel2 px-2 py-1.5 text-right font-mono text-[11px] text-text outline-none focus:border-teal" />
                    <span className="text-[9px] text-faint">saat</span>
                  </label>
                );
              })}
            </div>
          ) : <div className="rounded-lg border border-dashed border-border px-3 py-3 text-[10px] text-muted">Henüz bakım türü tanımlanmamış. Motoru sonra bakım türü yönetiminden de dahil edebilirsin.</div>}
        </div>
        <button
          type="submit" disabled={saving}
          className="py-2.5 rounded-lg bg-teal text-on-teal text-[12.5px] font-extrabold disabled:opacity-50 hover:brightness-110 transition"
        >
          {saving ? "Ekleniyor..." : " Kaydet"}
        </button>
      </div>
    </form>
  );
}
