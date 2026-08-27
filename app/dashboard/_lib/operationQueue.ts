import type { PanelItem, StatusKey } from "../../../lib/status";

const STATUS_PRIORITY: Record<StatusKey, number> = {
  gecikmis: 0,
  kritik: 1,
  yaklasiyor: 2,
  normal: 3,
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "tr", { sensitivity: "base", numeric: true });
}

/**
 * Dashboard panelindeki bakım maddelerini saha önceliğine göre sıralar.
 * Gecikmiş maddelerde en fazla gecikmiş olan, diğer durumlarda en az saati
 * kalan madde önce gelir. Eşitlikte motor ve bakım adı deterministik kalır.
 */
export function compareOperationItems(left: PanelItem, right: PanelItem): number {
  const statusDifference = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
  if (statusDifference !== 0) return statusDifference;

  const remainingDifference = left.remaining - right.remaining;
  if (remainingDifference !== 0) return remainingDifference;

  const engineDifference = compareText(left.engine_name, right.engine_name);
  if (engineDifference !== 0) return engineDifference;

  return compareText(left.type_label, right.type_label);
}

export function buildOperationQueue(items: PanelItem[], limit = 6): PanelItem[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  return [...items].sort(compareOperationItems).slice(0, safeLimit);
}

export function filterOperationItems(items: PanelItem[], filter: "all" | StatusKey): PanelItem[] {
  if (filter === "all") return items;
  return items.filter((item) => item.status === filter);
}
