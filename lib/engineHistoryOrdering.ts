import type { EngineHistoryEntry } from "./types.ts";

const SOURCE_ORDER: Record<string, number> = { excel: 0, manual: 1, record: 2 };

/** Aynı tarih/saatte Excel ölçümünü bakım kaydından önce tutar. */
export function compareEngineHistoryEntries(a: Pick<EngineHistoryEntry, "date" | "source">, b: Pick<EngineHistoryEntry, "date" | "source">): number {
  const dateDifference = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (dateDifference !== 0) return dateDifference;
  return (SOURCE_ORDER[a.source || ""] ?? 9) - (SOURCE_ORDER[b.source || ""] ?? 9);
}
