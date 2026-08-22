/** Türkiye telefon numarasını uygulama içinde +905XXXXXXXXX biçimine çevirir. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("90")) return `+${digits}`;
  if (digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.startsWith("5")) return `+90${digits}`;
  return `+${digits}`;
}

export function isValidPhone(value: string): boolean {
  return /^\+905\d{9}$/.test(normalizePhone(value));
}

export function phoneDisplay(value?: string): string {
  if (!value) return "";
  const normalized = normalizePhone(value);
  return normalized.replace(/^(\+90)(\d{3})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}
