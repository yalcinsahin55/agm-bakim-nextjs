import type { EngineHistoryEntry } from "@/lib/types";

export const MAX_COMPLETION_HOURS_BEHIND_CURRENT = 24;

export interface ExcelHourSnapshot {
  date: string;
  hours: number;
}

export interface CompletionHourRule {
  minimumHours: number;
  maximumHours?: number;
  reference?: ExcelHourSnapshot;
  elapsedHours?: number;
}

function validDate(value: unknown): Date | null {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function latestExcelHourSnapshot(history: readonly EngineHistoryEntry[] | undefined): ExcelHourSnapshot | null {
  if (!Array.isArray(history)) return null;
  return history
    .filter((entry) => entry.source === "excel" && Number.isFinite(Number(entry.hours)) && validDate(entry.date))
    .map((entry) => ({ date: String(entry.date), hours: Number(entry.hours) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .at(-1) || null;
}

export function getCompletionHourRule(
  currentEngineHours: number,
  history: readonly EngineHistoryEntry[] | undefined,
  maintenanceStartAt?: Date | string,
): CompletionHourRule {
  const reference = latestExcelHourSnapshot(history);
  const minimumHours = Math.max(0, Number(currentEngineHours || 0) - MAX_COMPLETION_HOURS_BEHIND_CURRENT);
  if (!reference || maintenanceStartAt === undefined) return { minimumHours, reference: reference || undefined };

  const start = validDate(maintenanceStartAt);
  const referenceDate = validDate(reference.date);
  if (!start || !referenceDate) return { minimumHours, reference };

  const elapsedHours = Math.max(0, (start.getTime() - referenceDate.getTime()) / 3_600_000);
  return {
    minimumHours: Math.max(minimumHours, reference.hours - MAX_COMPLETION_HOURS_BEHIND_CURRENT),
    maximumHours: reference.hours + elapsedHours,
    reference,
    elapsedHours,
  };
}

export function getCompletionHourValidationError(
  enteredHours: number,
  currentEngineHours: number,
  history: readonly EngineHistoryEntry[] | undefined,
  maintenanceStartAt?: Date | string,
): string | null {
  const rule = getCompletionHourRule(currentEngineHours, history, maintenanceStartAt);
  const entered = Number(enteredHours);
  if (!Number.isFinite(entered) || entered < 0) return "Motor çalışma saati geçerli, negatif olmayan bir sayı olmalıdır.";
  if (entered < rule.minimumHours) {
    return `Bakım saati mevcut motor saatinden en fazla ${MAX_COMPLETION_HOURS_BEHIND_CURRENT} saat düşük olabilir. En düşük değer: ${rule.minimumHours.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat.`;
  }
  if (typeof rule.maximumHours === "number" && entered > rule.maximumHours + 1e-9) {
    const referenceText = rule.reference ? new Date(rule.reference.date).toLocaleString("tr-TR") : "son Excel ölçümünden";
    return `Bakım saati ${referenceText} sonrası geçen süreyi aşamaz. Bu bakım başlangıcı için en yüksek değer: ${rule.maximumHours.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat.`;
  }
  return null;
}
