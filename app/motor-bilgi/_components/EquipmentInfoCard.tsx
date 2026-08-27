import { FIELDS } from "../_lib/types";
import type { EquipmentInfo, FieldKey, FieldValues } from "../_lib/types";
import EquipmentFieldInputs from "./EquipmentFieldInputs";

interface EquipmentInfoCardProps {
  item: EquipmentInfo;
  isEditing: boolean;
  canEdit: boolean;
  editFields: FieldValues;
  saving: boolean;
  onStartEdit: (item: EquipmentInfo) => void;
  onFieldChange: (key: FieldKey, value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
}

export default function EquipmentInfoCard({ item, isEditing, canEdit, editFields, saving, onStartEdit, onFieldChange, onCancelEdit, onSave }: EquipmentInfoCardProps) {
  return (
    <div className={`bg-panel border rounded-card p-3.5 transition-all ${isEditing ? "border-teal/40" : "border-border hover:border-borderlt"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[13.5px] font-bold text-text">{item.engine_name || "İsimsiz Motor"}</div>
        {canEdit && !isEditing && (
          <button onClick={() => onStartEdit(item)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1 hover:bg-teal/10 transition">✏️ Düzenle</button>
        )}
      </div>

      {isEditing ? (
        <div className="animate-fade-in">
          <EquipmentFieldInputs values={editFields} onChange={onFieldChange} />
          <div className="flex gap-2 mt-3">
            <button onClick={onCancelEdit} className="flex-1 py-2 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">Vazgeç</button>
            <button onClick={onSave} disabled={saving} className="flex-1 py-2 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition">
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-[#06181b]/40 border-t-[#06181b] rounded-full animate-spin" />
                  Kaydediliyor...
                </span>
              ) : "💾 Kaydet"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {FIELDS.map(([key, label]) => item[key] ? (
            <div key={key} className="text-[11px]">
              <span className="text-faint">{label}: </span>
              <span className="text-muted">{item[key]}</span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}
