"use client";

export function formatMinutes(value: unknown): string {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remaining = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (remaining || parts.length === 0) parts.push(`${remaining} dk`);
  return parts.join(" ");
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDateOnly(value: unknown): string {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
}

export function stringValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function ResultEmpty({ children }: { children: string }) {
  return <div className="mt-3 rounded-lg border border-border bg-panel2 px-2.5 py-2.5 text-[10.5px] text-muted">{children}</div>;
}
