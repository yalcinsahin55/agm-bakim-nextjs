export function parseNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

export function parseRange(question: string, unitPattern: string): { min?: number; max?: number } | undefined {
  const range = question.match(new RegExp(`(\\d[\\d.,]*)\\s*${unitPattern}?\\s*(?:ile|-|–)\\s*(\\d[\\d.,]*)\\s*${unitPattern}`, "iu"));
  if (range) {
    const first = parseNumber(range[1]);
    const second = parseNumber(range[2]);
    if (Number.isFinite(first) && Number.isFinite(second)) return first <= second ? { min: first, max: second } : { min: second, max: first };
  }
  const above = question.match(new RegExp(`(\\d[\\d.,]*)\\s*${unitPattern}?(?:den|dan|ten|tan)\\s+(?:fazla|uzun|üzeri)`, "iu"));
  if (above) {
    const min = parseNumber(above[1]);
    if (Number.isFinite(min)) return { min };
  }
  const below = question.match(new RegExp(`(\\d[\\d.,]*)\\s*${unitPattern}?(?:den|dan|ten|tan)\\s+(?:az|kısa|altı)`, "iu"));
  if (below) {
    const max = parseNumber(below[1]);
    if (Number.isFinite(max)) return { max };
  }
  return undefined;
}

export function extractMaintenancePeriodHours(question: string): number | undefined {
  const match = question.match(/(?<![\d.,])(\d[\d.,]*)\s*(?:saat(?:lik)?\s*)?bakım(?:ı|ını|ları|larını)?\b/iu);
  if (!match) return undefined;
  const value = parseNumber(match[1]);
  return Number.isInteger(value) && value >= 100 && value <= 100000 ? value : undefined;
}
