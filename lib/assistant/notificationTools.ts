import type { Db } from "mongodb";
import type { AssistantQuery } from "@/lib/assistantPolicy";
import { notificationsCollection } from "@/lib/dbCollections";
import { formatUnknownDate } from "@/lib/assistantToolOutput";
import type { AssistantToolResponse } from "./types";
export async function getNotificationSummary(db: Db, query: AssistantQuery, userId: string | undefined): Promise<AssistantToolResponse> {
  if (!userId) return { intent: "notification_summary", period: "all", title: "Bildirim özeti", summary: "Bildirimleri göstermek için oturum kullanıcısı bulunamadı.", data: { notifications: [], count: 0 } };
  const match: Record<string, unknown> = { user_id: userId };
  if (query.unreadOnly) match.read_at = null;
  const notificationCollection = notificationsCollection(db);
  const [totalCount, groupedCounts, notifications] = await Promise.all([
    notificationCollection.countDocuments(match),
    notificationCollection.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: { $ifNull: ["$status", "$type"] }, count: { $sum: 1 } } }]).toArray(),
    notificationCollection.find(match, { projection: { _id: 1, type: 1, status: 1, title: 1, message: 1, href: 1, read_at: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(100).toArray(),
  ]);
  const counts = groupedCounts.reduce<Record<string, number>>((result, item) => { const key = String(item._id || "system"); result[key] = Number(item.count || 0); return result; }, {});
  return {
    intent: "notification_summary",
    period: "all",
    title: query.unreadOnly ? "Okunmamış bildirimler" : "Bildirim özeti",
    summary: query.unreadOnly ? `${totalCount} okunmamış bildirim bulundu.` : `${totalCount} bildirim bulundu.`,
    data: { count: totalCount, displayed_count: notifications.length, counts, notifications: notifications.map((notification) => ({ id: String(notification._id), type: notification.type, status: notification.status, title: notification.title, message: notification.message, href: notification.href || null, read_at: formatUnknownDate(notification.read_at), created_at: formatUnknownDate(notification.created_at) })) },
  };
}

