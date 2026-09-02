export type AnalyticsWorkPeriod = "week" | "month" | "total";

export function analyticsWorkRange(now: Date, period: AnalyticsWorkPeriod): { from: Date; to: Date } | null {
  if (!Number.isFinite(now.getTime()) || period === "total") return null;
  if (period === "week") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    to.setUTCMilliseconds(-1);
    return { from, to };
  }
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)),
    to: now,
  };
}

export function analyticsWorkRangeLabel(period: AnalyticsWorkPeriod): string {
  return period === "week" ? "mevcut hafta" : period === "month" ? "son 12 ay" : "tüm dönem";
}

export function groupPeriodLabel(month: string, week: string): string {
  return week ? `${month} · ${week}` : month;
}

