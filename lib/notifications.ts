import type { Db } from "mongodb";
import type { Notification, User } from "./types";
import { buildItems, STATUS_LABELS, type PanelItem } from "./status";
import { sendPushToUser } from "./push";
import { ensureAppIndexes } from "./dbIndexes";

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

async function loadActionableItems(db: Db): Promise<PanelItem[]> {
  const [engines, types] = await Promise.all([
    db.collection("engines").find({}, { projection: { _id: 1, name: 1, hours: 1, load_kw: 1 } }).toArray(),
    db.collection("maintenance_types").find({ is_deleted: { $ne: true } }, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, engine_states: 1 } }).toArray(),
  ]);
  return buildItems(engines as any, types as any).filter((item) => item.status !== "normal");
}

export async function listUserNotifications(db: Db, userId: string, limit?: number): Promise<Notification[]> {
  const cursor = db.collection("notifications")
    .find({ user_id: userId })
    .sort({ read_at: 1, created_at: -1 });
  const notifications = (typeof limit === "number" ? cursor.limit(limit) : cursor).toArray();
  return (await notifications) as unknown as Notification[];
}

async function syncUserNotifications(db: Db, user: User, actionable: PanelItem[], listAfterSync = true): Promise<Notification[] | null> {
  const collection = db.collection("notifications");
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
      { projection: { dedupe_key: 1, status: 1 } },
    ).toArray()
    : [];
  const existingByKey = new Map(existingRows.map((row: any) => [String(row.dedupe_key), row]));
  const updates = actionable.map((item) => {
    const dedupeKey = `maintenance:${user._id}:${item.engine_id}:${item.type_key}`;
    const text = notificationText(item.status as "gecikmis" | "kritik" | "yaklasiyor", item.engine_name, item.type_label, item.remaining);
    return {
      dedupeKey,
      text,
      status: item.status,
      previous: existingByKey.get(dedupeKey),
      update: {
        updateOne: {
          filter: { dedupe_key: dedupeKey },
          update: {
            $set: {
              user_id: user._id,
              type: "maintenance",
              status: item.status,
              title: text.title,
              message: text.message,
              href: "/dashboard",
              updated_at: now,
            },
            $setOnInsert: { dedupe_key: dedupeKey, created_at: now, read_at: null },
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

  return listAfterSync ? listUserNotifications(db, user._id) : null;
}

export async function syncMaintenanceNotifications(db: Db, user: User): Promise<Notification[]> {
  await ensureAppIndexes(db);
  const notifications = await syncUserNotifications(db, user, await loadActionableItems(db), true);
  return notifications || [];
}

export async function syncMaintenanceNotificationsForAllUsers(db: Db): Promise<{ users: number; actionable: number }> {
  await ensureAppIndexes(db);
  const [users, actionable] = await Promise.all([
    db.collection("users").find(
      { active: { $ne: false }, approved: { $ne: false } },
      { projection: { _id: 1, full_name: 1, role: 1 } },
    ).toArray(),
    loadActionableItems(db),
  ]);
  for (const user of users) {
    // Cron yalnızca üretim/güncelleme yapar; kullanıcı bildirim listesini ayrıca okumaz.
    await syncUserNotifications(db, user as unknown as User, actionable, false);
  }
  return { users: users.length, actionable: actionable.length };
}

export function statusLabel(status: Notification["status"]): string {
  if (status === "system") return "Sistem";
  return STATUS_LABELS[status];
}
