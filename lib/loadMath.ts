export function averageNonZeroLoad(values: readonly unknown[]): number | null {
  const validLoads = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return validLoads.length ? validLoads.reduce((sum, value) => sum + value, 0) / validLoads.length : null;
}
