import { FIELDS } from "../_lib/types";
import type { FieldKey, FieldValues } from "../_lib/types";

interface EquipmentFieldInputsProps {
  values: FieldValues;
  onChange: (key: FieldKey, value: string) => void;
}

export default function EquipmentFieldInputs({ values, onChange }: EquipmentFieldInputsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {FIELDS.map(([key, label]) => (
        <div key={key} className={key === "not" ? "col-span-2" : ""}>
          <label className="text-[9.5px] font-bold text-faint uppercase tracking-wide">{label}</label>
          <input
            value={values[key] || ""} onChange={(event) => onChange(key, event.target.value)}
            className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-[12.5px] mt-1 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
        </div>
      ))}
    </div>
  );
}
