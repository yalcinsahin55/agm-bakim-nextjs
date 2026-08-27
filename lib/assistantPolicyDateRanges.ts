import type { AssistantDateRange } from "./assistantPolicyTypes.ts";

const TURKISH_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6,
  temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12,
};
const TURKISH_MONTH_PATTERN = Object.keys(TURKISH_MONTHS).join("|");

function dateKey(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftDateKey(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) || value;
}

export function currentTurkeyDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return dateKey(Number(values.year), Number(values.month), Number(values.day)) || new Date().toISOString().slice(0, 10);
}

function dateRange(from: string, to = from): AssistantDateRange {
  return from <= to ? { from, to } : { from: to, to: from };
}

type CalendarQuarter = 1 | 2 | 3 | 4;

function quarterNumber(value: string): CalendarQuarter | null {
  const normalized = value.toLocaleLowerCase("tr-TR").replace(/\./g, "");
  if (["ilk", "birinci", "1"].includes(normalized)) return 1;
  if (["ikinci", "2"].includes(normalized)) return 2;
  if (["üçüncü", "3"].includes(normalized)) return 3;
  if (["son", "dördüncü", "4"].includes(normalized)) return 4;
  return null;
}

function calendarQuarterRange(year: number, quarter: CalendarQuarter): AssistantDateRange | undefined {
  const startMonth = (quarter - 1) * 3 + 1;
  const from = dateKey(year, startMonth, 1);
  const lastDay = new Date(Date.UTC(year, startMonth + 2, 0)).getUTCDate();
  const to = dateKey(year, startMonth + 2, lastDay);
  return from && to ? dateRange(from, to) : undefined;
}

function parseQuarterRange(question: string, currentYear: number): AssistantDateRange | undefined {
  const previousQuarter = /\bgeçen\s+çeyrek\b/iu.test(question);
  const currentQuarter = /\bbu\s+çeyrek\b/iu.test(question);
  if (previousQuarter || currentQuarter) {
    const today = currentTurkeyDateKey();
    const monthIndex = Number(today.slice(5, 7)) - 1;
    const currentQuarterNumber = Math.floor(monthIndex / 3) + 1;
    let quarter = currentQuarterNumber as CalendarQuarter;
    let year = currentYear;
    if (previousQuarter) {
      if (quarter === 1) {
        quarter = 4;
        year -= 1;
      } else {
        quarter = (quarter - 1) as CalendarQuarter;
      }
    }
    return calendarQuarterRange(year, quarter);
  }

  const termPattern = "(ilk|birinci|ikinci|üçüncü|dördüncü|son|1\\.?|2\\.?|3\\.?|4\\.?)";
  const beforeYear = question.match(new RegExp(`(?<!\\d)((?:20|21)\\d{2})(?:['’][a-zçğıöşü]+)?\\s*${termPattern}\\s*çeyrek`, "iu"));
  const afterYear = question.match(new RegExp(`${termPattern}\\s*çeyrek[^?]{0,30}?(?<!\\d)((?:20|21)\\d{2})(?!\\d)`, "iu"));
  const generic = question.match(new RegExp(`${termPattern}\\s*çeyrek`, "iu"));
  const term = beforeYear?.[2] || afterYear?.[1] || generic?.[1];
  const quarter = term ? quarterNumber(term) : null;
  if (!quarter) return undefined;
  const year = Number(beforeYear?.[1] || afterYear?.[2] || currentYear);
  return calendarQuarterRange(year, quarter);
}

export function parseDateRange(question: string): AssistantDateRange | undefined {
  const currentYear = Number(currentTurkeyDateKey().slice(0, 4));
  const numericDates: string[] = [];
  for (const match of question.matchAll(/(?<!\d)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/g)) {
    const parsed = dateKey(Number(match[1]), Number(match[2]), Number(match[3]));
    if (parsed) numericDates.push(parsed);
  }
  for (const match of question.matchAll(/(?<![\d-])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/g)) {
    const parsed = dateKey(Number(match[3]), Number(match[2]), Number(match[1]));
    if (parsed) numericDates.push(parsed);
  }
  if (numericDates.length >= 2) return dateRange(numericDates[0], numericDates[1]);
  if (numericDates.length === 1) return dateRange(numericDates[0]);

  const quarterRange = parseQuarterRange(question, currentYear);
  if (quarterRange) return quarterRange;

  const sameMonthRange = question.match(new RegExp(`(?<!\d)(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(${TURKISH_MONTH_PATTERN})(?:['’][a-zçğıöşü]+)?(?:\s+(\d{4}))?`, "iu"));
  if (sameMonthRange) {
    const month = TURKISH_MONTHS[sameMonthRange[3].toLocaleLowerCase("tr-TR")];
    const year = Number(sameMonthRange[4] || currentYear);
    const from = dateKey(year, month, Number(sameMonthRange[1]));
    const to = dateKey(year, month, Number(sameMonthRange[2]));
    if (from && to) return dateRange(from, to);
  }

  const dayMonthDates: string[] = [];
  for (const match of question.matchAll(new RegExp(`(?<!\d)(\d{1,2})\s+(${TURKISH_MONTH_PATTERN})(?:['’][a-zçğıöşü]+)?(?:\s+(\d{4}))?`, "giu"))) {
    const month = TURKISH_MONTHS[match[2].toLocaleLowerCase("tr-TR")];
    const parsed = dateKey(Number(match[3] || currentYear), month, Number(match[1]));
    if (parsed) dayMonthDates.push(parsed);
  }
  if (dayMonthDates.length >= 2) return dateRange(dayMonthDates[0], dayMonthDates[1]);
  if (dayMonthDates.length === 1) return dateRange(dayMonthDates[0]);

  const monthYear = question.match(new RegExp(`(${TURKISH_MONTH_PATTERN})(?:['’]?[a-zçğıöşü]+)?\s+(\d{4})`, "iu"))
    || question.match(new RegExp(`(\d{4})\s+(${TURKISH_MONTH_PATTERN})`, "iu"));
  if (monthYear) {
    const monthName = monthYear[1].match(/^\d/) ? monthYear[2] : monthYear[1];
    const year = Number(monthYear[1].match(/^\d/) ? monthYear[1] : monthYear[2]);
    const month = TURKISH_MONTHS[monthName.toLocaleLowerCase("tr-TR")];
    const from = dateKey(year, month, 1);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const to = dateKey(year, month, lastDay);
    if (from && to) return dateRange(from, to);
  }

  const today = currentTurkeyDateKey();
  const recentRange = question.match(/\bson\s+(bir|\d+)\s+(gün|hafta)\b/iu);
  if (recentRange) {
    const quantity = recentRange[1].toLocaleLowerCase("tr-TR") === "bir" ? 1 : Number(recentRange[1]);
    const unit = recentRange[2].toLocaleLowerCase("tr-TR");
    if (Number.isInteger(quantity) && quantity > 0 && quantity <= 52) {
      const days = unit === "hafta" ? quantity * 7 : quantity;
      return dateRange(shiftDateKey(today, -(days - 1)), today);
    }
  }
  if (/geçen\s+hafta/iu.test(question) || /bu\s+hafta/iu.test(question)) {
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const monday = shiftDateKey(today, -(weekday + 6) % 7);
    return /geçen\s+hafta/iu.test(question) ? dateRange(shiftDateKey(monday, -7), shiftDateKey(monday, -1)) : dateRange(monday, shiftDateKey(monday, 6));
  }
  if (/geçen\s+ay/iu.test(question)) {
    const firstThisMonth = `${today.slice(0, 8)}01`;
    const lastPreviousMonth = shiftDateKey(firstThisMonth, -1);
    const from = `${lastPreviousMonth.slice(0, 8)}01`;
    return dateRange(from, lastPreviousMonth);
  }
  const yearOnly = question.match(/(?<![\d-])((?:20|21)\d{2})(?:['’]?(?:de|da|te|ta)|\s+yıl(?:ında|ı|da|de)?|\s+senesinde|\s+içinde|\s+boyunca)/iu);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    const from = dateKey(year, 1, 1);
    const to = dateKey(year, 12, 31);
    if (from && to) return dateRange(from, to);
  }
  return undefined;
}
