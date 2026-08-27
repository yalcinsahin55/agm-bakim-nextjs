import type { Notification, NotificationStatus } from "@/lib/types";

export type GroupStatus = Exclude<NotificationStatus, "system">;

export type NotificationGroup = {
  status: GroupStatus;
  title: string;
  icon: string;
  summary: string;
  notifications: Notification[];
};

export const GROUP_CONFIG: Record<GroupStatus, { title: string; icon: string; summaryNoun: string; className: string; iconClassName: string; badgeClassName: string }> = {
  gecikmis: {
    title: "Gecikmiş bakımlar",
    icon: "🚨",
    summaryNoun: "gecikmiş bakım",
    className: "border-red/35 bg-red/[0.06]",
    iconClassName: "border-red/35 bg-red/10 text-red",
    badgeClassName: "bg-red/20 text-red border-red/35",
  },
  kritik: {
    title: "Kritik bakımlar",
    icon: "⚠️",
    summaryNoun: "kritik bakım",
    className: "border-orange/35 bg-orange/[0.06]",
    iconClassName: "border-orange/35 bg-orange/10 text-orange",
    badgeClassName: "bg-orange/20 text-orange border-orange/35",
  },
  yaklasiyor: {
    title: "Yaklaşan bakımlar",
    icon: "⏳",
    summaryNoun: "yaklaşan bakım",
    className: "border-yellow/35 bg-yellow/[0.06]",
    iconClassName: "border-yellow/35 bg-yellow/10 text-yellow",
    badgeClassName: "bg-yellow/20 text-yellow border-yellow/35",
  },
};

export const STATUS_ORDER: GroupStatus[] = ["gecikmis", "kritik", "yaklasiyor"];
export const INITIAL_VISIBLE_ITEMS = 3;

export function getNotificationTimestamp(notification: Notification): number {
  const value = notification.last_notified_at ?? notification.created_at;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortNewestFirst(notifications: Notification[]): Notification[] {
  return [...notifications].sort((a, b) => getNotificationTimestamp(b) - getNotificationTimestamp(a));
}

export function formatNotificationDate(notification: Notification): string {
  const value = notification.last_notified_at ?? notification.created_at;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Tarih bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getGroupSummary(notifications: Notification[]): string {
  const engines = new Set<string>();
  const types = new Set<string>();
  notifications.forEach((notification) => {
    const message = notification.message || "";
    const [enginePart, typePart] = message.split(" için ");
    if (enginePart?.trim()) engines.add(enginePart.trim());
    if (typePart?.trim()) types.add(typePart.replace(/ bakımı.*$/u, "").trim());
  });
  const engineCount = engines.size || notifications.length;
  const typeCount = types.size || notifications.length;
  return `${engineCount} motor · ${typeCount} ${typeCount === 1 ? "bakım türü" : "bakım türü"}`;
}

export function groupNotifications(notifications: Notification[]): NotificationGroup[] {
  const newestFirst = sortNewestFirst(notifications);
  return STATUS_ORDER
    .map((status) => {
      const grouped = newestFirst.filter((notification) => notification.status === status);
      if (grouped.length === 0) return null;
      return {
        status,
        title: GROUP_CONFIG[status].title,
        icon: GROUP_CONFIG[status].icon,
        summary: getGroupSummary(grouped),
        notifications: grouped,
      };
    })
    .filter((group): group is NotificationGroup => Boolean(group))
    .sort((a, b) => getNotificationTimestamp(b.notifications[0]) - getNotificationTimestamp(a.notifications[0]));
}
