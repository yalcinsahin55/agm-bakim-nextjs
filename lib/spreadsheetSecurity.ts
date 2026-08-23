const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export function escapeSpreadsheetValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function escapeSpreadsheetRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, escapeSpreadsheetValue(value)]),
  ) as T);
}
