import type { Db } from "mongodb";
import webpush from "web-push";

export interface PushPayload {
  title: string;
  body: string;
  href?: string;
  tag?: string;
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export interface PushSubscriptionRecord {
  _id?: string;
  user_id: string;
  endpoint: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
  user_agent?: string;
  created_at: Date;
  updated_at: Date;
}

let configured = false;

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getPublicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function sendPushToUser(db: Db, userId: string, payload: PushPayload) {
  if (!configureWebPush()) return { sent: 0, skipped: true };

  const collection = db.collection<PushSubscriptionRecord>("push_subscriptions");
  const subscriptions = await collection.find({ user_id: userId }).toArray();
  let sent = 0;
  let nextIndex = 0;
  const workerCount = Math.min(4, subscriptions.length);

  const sendWorker = async () => {
    while (nextIndex < subscriptions.length) {
      const record = subscriptions[nextIndex];
      nextIndex += 1;
      if (!record) continue;
      try {
        await webpush.sendNotification(record.subscription, JSON.stringify(payload));
        sent += 1;
      } catch (error: unknown) {
        const statusCode = getErrorStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await collection.deleteOne({ endpoint: record.endpoint });
        } else {
          console.error("Web Push gönderilemedi:", error instanceof Error ? error.name : "UnknownError");
        }
      }
    }
  };

  if (workerCount > 0) await Promise.all(Array.from({ length: workerCount }, () => sendWorker()));

  return { sent, skipped: false };
}
