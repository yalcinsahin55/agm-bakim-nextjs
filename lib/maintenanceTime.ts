export const TIME_TRACKING_VERSION = 2 as const;

export function calculateMaintenanceDurationMinutes(
  startTime: string | undefined,
  endTime: string | undefined,
): number | null {
  if (!startTime || !endTime) return null;
  const startMatch = /^(\d{2}):(\d{2})$/.exec(startTime);
  const endMatch = /^(\d{2}):(\d{2})$/.exec(endTime);
  if (!startMatch || !endMatch) return null;

  const startHours = Number(startMatch[1]);
  const startMinutes = Number(startMatch[2]);
  const endHours = Number(endMatch[1]);
  const endMinutes = Number(endMatch[2]);
  if (startHours > 23 || endHours > 23 || startMinutes > 59 || endMinutes > 59) return null;

  const start = startHours * 60 + startMinutes;
  const end = endHours * 60 + endMinutes;
  const duration = end >= start ? end - start : (24 * 60) - start + end;
  return duration > 0 && duration <= 24 * 60 ? duration : null;
}

export function calculateMaintenanceDurationFromDates(
  startAt: string | Date | undefined,
  endAt: string | Date | undefined,
): number | null {
  if (!startAt || !endAt) return null;
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) return null;
  const duration = Math.round((end.getTime() - start.getTime()) / 60_000);
  return duration > 0 && duration <= 366 * 24 * 60 ? duration : null;
}

/** Kullanıcı 0 dakika girdiyse bu değer geçerlidir; yalnızca boş/geçersiz değer fallback’e döner. */
export function normalizeTechnicianContributionDuration(value: unknown, fallback: number | null | undefined = 60): number {
  if (value !== undefined && value !== null && value !== "") {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) && fallbackValue >= 0 ? fallbackValue : 60;
}

export function minutesToHoursInput(minutes: number | undefined | null): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "";
  return String(Math.round((minutes / 60) * 100) / 100);
}

export function hoursInputToMinutes(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 60);
}

export interface DurationParts {
  hours: string;
  minutes: string;
}

export function splitDurationMinutes(value: number | null | undefined): DurationParts {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return { hours: "", minutes: "" };
  const totalMinutes = Math.floor(value);
  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60).padStart(2, "0"),
  };
}

export function durationPartsToMinutes(
  hoursValue: unknown,
  minutesValue: unknown,
  maxMinutes = 366 * 24 * 60,
): number | null {
  if ((hoursValue === undefined || hoursValue === null || hoursValue === "") && (minutesValue === undefined || minutesValue === null || minutesValue === "")) return null;
  const hours = hoursValue === undefined || hoursValue === null || hoursValue === "" ? 0 : Number(hoursValue);
  const minutes = minutesValue === undefined || minutesValue === null || minutesValue === "" ? 0 : Number(minutesValue);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes > 59) return null;
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes <= maxMinutes ? totalMinutes : null;
}

export function formatMaintenanceDuration(minutes: number | undefined | null): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes === 0) return "0 dk";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} dk`;
  return remainingMinutes ? `${hours} sa ${remainingMinutes} dk` : `${hours} sa`;
}

/** Yeni kayıtlarda bakım başlangıcı, legacy kayıtlarda created_at iş tarihi olarak kullanılır. */
export function getMaintenanceRecordDate(
  maintenanceStartAt?: Date | string | null,
  createdAt?: Date | string | null,
): Date | null {
  const value = maintenanceStartAt || createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatTimeInput(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatDateTimeLocal(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T${formatTimeInput(date)}`;
}
