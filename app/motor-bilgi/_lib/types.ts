export type FieldKey = "kaver_tipi" | "hava_filtresi" | "krankcase" | "esanjor_tipi" | "dungs" | "radyator_tipi" | "not";
export type FieldValues = Record<FieldKey, string>;

export interface EquipmentInfo extends FieldValues {
  _id: string;
  engine_name: string;
}

export interface EquipmentEngine {
  _id: string;
  name: string;
}

export interface EquipmentResponse {
  name?: string;
  updated?: number;
  error?: string;
}

export const FIELDS: Array<[FieldKey, string]> = [
  ["kaver_tipi", "Kaver Tipi"], ["hava_filtresi", "Hava Filtresi"], ["krankcase", "Krankcase"],
  ["esanjor_tipi", "Eşanjör Tipi"], ["dungs", "Dungs"], ["radyator_tipi", "Radyatör Tipi"], ["not", "Not"],
];

export function emptyForm(): FieldValues {
  return Object.fromEntries(FIELDS.map(([key]) => [key, ""])) as FieldValues;
}
