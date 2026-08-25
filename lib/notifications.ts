import type { Db } from "mongodb";
import type { Notification, User } from "./types";
import { buildItems, STATUS_LABELS, type PanelItem } from "./status";
import { sendPushToUser } from "./push";
import { ensureAppIndexes } from "./dbIndexes";
import { enginesCollection, maintenanceTypesCollection, notificationsCollection, usersCollection } from "@/lib/dbCollections";

function notificationText(status: "gecikmis" | "kritik" | "yaklasiyor", engineName: string, typeLabel: string, remaining: number) {
  if (status === "gecikmis") {
    return {
      title: "Bakım gecikmiş durumda",
      message: `${engineName} için ${typeLabel} bakımı ${Math.abs(remaining)} saat gecikmiş.`,
    };
  }
  if (status === "kritik") {
    return {
      title: "Kritik bakım yaklaşıyor",
      message: `${engineName} için ${typeLabel} bakımına ${remaining} saat kaldı.`,
    };
  }
  return {
    title: "Bakım yaklaşıyor",
    message: `${engineName} için ${typeLabel} bakımına ${remaining} saat kaldı.`,
  };
}

type ActionablePanelItem = PanelItem & { status: Exclude<PanelItem["status"], "normal"> };

function isActionableItem(item: PanelItem): item is ActionablePanelItem {
  return item.status !== "normal";
}

async function loadActionableItems(db: Db): Promise<ActionablePanelItem[]> {
  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1 } }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  return buildItems(engines, types).filter(isActionableItem);
}

export async function listUserNotifications(db: Db, userId: string, limit?: number): Promise<Notification[]> {
  // last_notified_at, bakım durumu gerçekten yeni bir uyarı ürettiğinde güncellenir.
  // Eski belgelerde bu alan bulunmayabileceği için created_at güvenli geri dönüş alanıdır.
  const pipeline = [
    { $match: { user_id: userId } },
    { $set: { _notification_sort_at: { $ifNull: ["$sort_at", { $ifNull: ["$last_notified_at", "$created_at"] }] } } },
    { $sort: { _notification_sort_at: -1, created_at: -1, _id: -1 } },
    ...(typeof limit === "number" ? [{ $limit: limit }] : []),
    { $unset: "_notification_sort_at" },
  ];
  const notifications = await notificationsCollection(db).aggregate<Notification>(pipeline).toArray();
  return notifications.map((notification) => ({
    ...notification,
    _id: notification._id == null ? undefined : String(notification._id),
  }));
}

async function syncUserNotifications(db: Db, user: User, actionable: ActionablePanelItem[], listAfterSync = true): Promise<Notification[] | null> {
  const collection = notificationsCollection(db);
  const now = new Date();
  const activeKeys = actionable.map((item) => `maintenance:${user._id}:${item.engine_id}:${item.type_key}`);

  if (activeKeys.length > 0) {
    await collection.deleteMany({
      user_id: user._id,
      type: "maintenance",
      dedupe_key: { $nin: activeKeys },
    });
  } else {
    await collection.deleteMany({ user_id: user._id, type: "maintenance" });
  }

  const existingRows = activeKeys.length > 0
    ? await collection.find(
      { dedupe_key: { $in: activeKeys } },
      { projection: { dedupe_key: 1, status: 1, sort_at: 1, last_notified_at: 1, created_at: 1 } },
    ).toArray()
    : [];
  const existingByKey = new Map(existingRows.map((row) => [String(row.dedupe_key), row] as const));
  const updates = actionable.map((item) => {
    const dedupeKey = `maintenance:${user._id}:${item.engine_id}:${item.type_key}`;
    const text = notificationText(item.status, item.engine_name, item.type_label, item.remaining);
    const previous = existingByKey.get(dedupeKey);
    const isNewNotification = !previous || previous.status !== item.status;
    const previousSortAt = previous && typeof previous.sort_at !== "undefined"
      ? previous.sort_at
      : previous?.last_notified_at || previous?.created_at;
    return {
      dedupeKey,
      text,
      status: item.status,
      previous,
      update: {
        updateOne: {
          filter: { dedupe_key: dedupeKey },
          update: {
            $set: {
              user_id: user._id,
              type: "maintenance" as const,
              status: item.status,
              title: text.title,
              message: text.message,
              href: "/dashboard",
              updated_at: now,
              sort_at: isNewNotification ? now : (previousSortAt || now),
              ...(isNewNotification ? { last_notified_at: now } : {}),
            },
            $setOnInsert: { dedupe_key: dedupeKey, created_at: now, last_notified_at: now, sort_at: now, read_at: null },
          },
          upsert: true,
        },
      },
    };
  });
  if (updates.length > 0) {
    await collection.bulkWrite(updates.map((item) => item.update), { ordered: false });
  }
  for (const item of updates) {
    if (!item.previous || item.previous.status !== item.status) {
      await sendPushToUser(db, user._id, {
        title: item.text.title,
        body: item.text.message,
        href: "/bildirimler",
        tag: item.dedupeKey,
      });
    }
  }

  return listAfterSync ? listUserNotifications(db, user._id, 500) : null;
}

export async function syncMaintenanceNotifications(db: Db, user: User): Promise<Notification[]> {
  await ensureAppIndexes(db);
  const notifications = await syncUserNotifications(db, user, await loadActionableItems(db), true);
  return notifications || [];
}

/**
 * Mutasyonları bildirim senkronizasyonundaki geçici bir hataya bağlamaz.
 * Böylece bakım kaydı başarıyla kaydedilir; sonraki zil/cron yenilemesi bildirimi toparlar.
 */
export async function refreshUserMaintenanceNotificationsBestEffort(db: Db, user: User): Promise<void> {
  try {
    await syncMaintenanceNotifications(db, user);
  } catch (error) {
    console.error("Bakım bildirimleri senkronize edilemedi:", error instanceof Error ? error.name : "UnknownError");
  }
}

export async function syncMaintenanceNotificationsForAllUsers(db: Db): Promise<{ users: number; actionable: number }> {
  await ensureAppIndexes(db);
  const [users, actionable] = await Promise.all([
    usersCollection(db).find(
      { active: { $ne: false }, approved: { $ne: false } },
      { projection: { _id: 1, full_name: 1, role: 1 } },
    ).toArray(),
    loadActionableItems(db),
  ]);
  for (const user of users) {
    // Cron yalnızca üretim/güncelleme yapar; kullanıcı bildirim listesini ayrıca okumaz.
    await syncUserNotifications(db, user, actionable, false);
  }
  return { users: users.length, actionable: actionable.length };
}

export function statusLabel(status: Notification["status"]): string {
  if (status === "system") return "Sistem";
  return STATUS_LABELS[status];
}
