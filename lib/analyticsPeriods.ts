export type AnalyticsWorkPeriod = "week" | "month" | "total";

type DateRangeOptions = {
  month?: string | null;
  weekStart?: string | null;
  from?: string | null;
  to?: string | null;
};

function parseDate(value: string | null | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function analyticsWorkRange(now: Date, period: AnalyticsWorkPeriod, options: DateRangeOptions = {}): { from: Date; to: Date } | null {
  if (!Number.isFinite(now.getTime())) return null;
  if (options.from || options.to) {
    const from = parseDate(options.from) || new Date(0);
    const to = parseDate(options.to, true) || now;
    return from <= to ? { from, to } : null;
  }
  if (period === "total") return null;
  if (period === "week") {
    const selectedStart = parseDate(options.weekStart);
    const from = selectedStart || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    to.setUTCMilliseconds(-1);
    return { from, to };
  }
  if (options.month && /^\d{4}-\d{2}$/.test(options.month)) {
    const [year, month] = options.month.split("-").map(Number);
    if (!Number.isInteger(year) || month < 1 || month > 12) return null;
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1) - 1);
    return { from, to };
  }
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)), to: now };
}

export function analyticsWorkRangeLabel(period: AnalyticsWorkPeriod): string {
  return period === "week" ? "mevcut hafta" : period === "month" ? "seçilen ay / son 12 ay" : "tüm dönem";
}

export function groupPeriodLabel(month: string, week: string): string {
  return week ? `${month} · ${week}` : month;
}
