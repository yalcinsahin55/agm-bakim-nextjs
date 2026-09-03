import type { FieldKey, FieldValues } from "../_lib/types";
import EquipmentFieldInputs from "./EquipmentFieldInputs";

interface EquipmentInfoAddFormProps {
  engineNamesWithoutCard: string[];
  engineName: string;
  fields: FieldValues;
  adding: boolean;
  onEngineNameChange: (value: string) => void;
  onFieldChange: (key: FieldKey, value: string) => void;
  onSave: () => void;
}

export default function EquipmentInfoAddForm({ engineNamesWithoutCard, engineName, fields, adding, onEngineNameChange, onFieldChange, onSave }: EquipmentInfoAddFormProps) {
  return (
    <div className="bg-panel border border-amber/40 rounded-card p-3.5 mb-4 animate-fade-in">
      <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide block mb-1">Motor</label>
      {engineNamesWithoutCard.length > 0 ? (
        <select value={engineName} onChange={(event) => onEngineNameChange(event.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal transition">
          <option value="">Seçiniz...</option>
          {engineNamesWithoutCard.map((name) => <option key={name} value={name}>{name}</option>)}
          <option value="__custom__">Listede yok, adını yazacağım...</option>
        </select>
      ) : null}
      {(engineNamesWithoutCard.length === 0 || engineName === "__custom__") && (
        <input
          value={engineName === "__custom__" ? "" : engineName}
          onChange={(event) => onEngineNameChange(event.target.value)}
          placeholder="Motor adı (örn. AGM 40)"
          className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal transition"
        />
      )}
      <EquipmentFieldInputs values={fields} onChange={onFieldChange} />
      <button onClick={onSave} disabled={adding} className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50 hover:brightness-110 transition">
        {adding ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
            Ekleniyor...
          </span>
        ) : "💾 Motor Bilgisini Kaydet"}
      </button>
    </div>
  );
}
