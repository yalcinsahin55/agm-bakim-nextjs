interface EngineAddFormProps {
  name: string;
  hours: string;
  load: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onHoursChange: (value: string) => void;
  onLoadChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export default function EngineAddForm({ name, hours, load, saving, onNameChange, onHoursChange, onLoadChange, onSubmit }: EngineAddFormProps) {
  return (
    <form onSubmit={onSubmit} className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
      <div className="text-[12px] font-bold text-teal mb-2">➕ Yeni Motor Ekle</div>
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
        <button
          type="submit" disabled={saving}
          className="py-2.5 rounded-lg bg-teal text-[#06181b] text-[12.5px] font-extrabold disabled:opacity-50 hover:brightness-110 transition"
        >
          {saving ? "Ekleniyor..." : "💾 Kaydet"}
        </button>
      </div>
    </form>
  );
}
