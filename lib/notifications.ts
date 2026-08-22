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
    db.collection("maintenance_types").find({}, { projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_states: 1 } }).toArray(),
  ]);
  return buildItems(engines as any, types as any).filter((item) => item.status !== "normal");
}

export async function listUserNotifications(db: Db, userId: string, limit = 50): Promise<Notification[]> {
  const notifications = await db.collection("notifications")
    .find({ user_id: userId })
    .sort({ read_at: 1, created_at: -1 })
    .limit(limit)
    .toArray();
  return notifications as unknown as Notification[];
}

async function syncUserNotifications(db: Db, user: User, actionable: PanelItem[]): Promise<Notification[]> {
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

  for (const item of actionable) {
    const dedupeKey = `maintenance:${user._id}:${item.engine_id}:${item.type_key}`;
    const text = notificationText(item.status as "gecikmis" | "kritik" | "yaklasiyor", item.engine_name, item.type_label, item.remaining);
    const existing = await collection.findOne({ dedupe_key: dedupeKey }, { projection: { status: 1 } });
    await collection.updateOne(
      { dedupe_key: dedupeKey },
      {
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
      { upsert: true },
    );
    if (!existing || existing.status !== item.status) {
      await sendPushToUser(db, user._id, {
        title: text.title,
        body: text.message,
        href: "/bildirimler",
        tag: dedupeKey,
      });
    }
  }

  return listUserNotifications(db, user._id);
}

export async function syncMaintenanceNotifications(db: Db, user: User): Promise<Notification[]> {
  await ensureAppIndexes(db);
  return syncUserNotifications(db, user, await loadActionableItems(db));
}

export async function syncMaintenanceNotificationsForAllUsers(db: Db): Promise<void> {
  await ensureAppIndexes(db);
  const [users, actionable] = await Promise.all([
    db.collection("users").find(
      { active: { $ne: false }, approved: { $ne: false } },
      { projection: { _id: 1, full_name: 1, role: 1 } },
    ).toArray(),
    loadActionableItems(db),
  ]);
  for (const user of users) {
    await syncUserNotifications(db, user as unknown as User, actionable);
  }
}

export function statusLabel(status: Notification["status"]): string {
  if (status === "system") return "Sistem";
  return STATUS_LABELS[status];
}
