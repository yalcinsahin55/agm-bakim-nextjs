import { Button, Input } from "@/components/ui";

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
    <form onSubmit={onSubmit} className="mb-4 rounded-card border border-teal/40 bg-panel p-3.5 animate-fade-in">
      <div className="mb-2 text-[12px] font-bold text-teal">➕ Yeni Motor Ekle</div>
      <div className="flex flex-col gap-2">
        <Input required placeholder="Motor adı (örn. Motor 7)" value={name} onChange={(event) => onNameChange(event.target.value)} className="text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="Güncel saat" value={hours} onChange={(event) => onHoursChange(event.target.value)} className="font-mono" />
          <Input type="number" placeholder="Yük (kW)" value={load} onChange={(event) => onLoadChange(event.target.value)} className="font-mono" />
        </div>
        <Button type="submit" disabled={saving} variant="secondary" size="lg" className="border-teal/40 bg-teal text-bg hover:brightness-110">
          {saving ? "Ekleniyor..." : "💾 Kaydet"}
        </Button>
      </div>
    </form>
  );
}
