import type { Db } from "mongodb";
import type { Notification, User } from "./types";
import { buildItems, STATUS_LABELS } from "./status";

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

export async function syncMaintenanceNotifications(db: Db, user: User): Promise<Notification[]> {
  const engines = await db.collection("engines").find().toArray();
  const types = await db.collection("maintenance_types").find().toArray();
  const items = buildItems(engines as any, types as any);
  const actionable = items.filter((item) => item.status !== "normal");
  const collection = db.collection("notifications");
  const now = new Date();

  await collection.createIndex({ user_id: 1, read_at: 1, created_at: -1 });
  await collection.createIndex({ dedupe_key: 1 }, { unique: true, sparse: true });

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

  if (actionable.length > 0) {
    await collection.bulkWrite(actionable.map((item) => {
      const dedupeKey = `maintenance:${user._id}:${item.engine_id}:${item.type_key}`;
      const text = notificationText(item.status as "gecikmis" | "kritik" | "yaklasiyor", item.engine_name, item.type_label, item.remaining);
      return {
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
      };
    }));
  }

  return (await collection
    .find({ user_id: user._id })
    .sort({ read_at: 1, created_at: -1 })
    .limit(50)
    .toArray()) as unknown as Notification[];
}

export function statusLabel(status: Notification["status"]): string {
  if (status === "system") return "Sistem";
  return STATUS_LABELS[status];
}
