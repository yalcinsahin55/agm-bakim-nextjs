export const FORECAST_DAILY_ENGINE_HOURS = 24;

export function forecastDaysFromRemainingHours(remainingHours: number): number {
  return Math.ceil(Math.max(Number.isFinite(remainingHours) ? remainingHours : 0, 0) / FORECAST_DAILY_ENGINE_HOURS);
}
