import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPublicVapidKey, isPushConfigured } from "@/lib/push";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { isAllowedPushEndpoint } from "@/lib/pushSecurity";
import {
  MAX_PUSH_SUBSCRIPTION_REQUEST_BYTES,
  readRequestTextLimited,
  RequestBodyTooLargeError,
} from "@/lib/requestLimits";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  return { db, user };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readJsonBody(req: NextRequest): Promise<unknown> {
  const text = await readRequestTextLimited(req, MAX_PUSH_SUBSCRIPTION_REQUEST_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { user } = await getUser(req);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  return NextResponse.json({ configured: isPushConfigured(), publicKey: getPublicVapidKey() });
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await getUser(req);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    await ensureAppIndexes(db);
    if (!isPushConfigured()) return NextResponse.json({ error: "Web Push henüz yapılandırılmamış." }, { status: 503 });
    const rateLimited = await enforceApiRateLimit(req, "push-subscribe", 30, 60 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const body = await readJsonBody(req);
    const bodyRecord = isRecord(body) ? body : null;
    const subscription = bodyRecord && isRecord(bodyRecord.subscription) ? bodyRecord.subscription : null;
    const keys = subscription && isRecord(subscription.keys) ? subscription.keys : null;
    const endpoint = subscription?.endpoint;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint) || typeof p256dh !== "string" || p256dh.length > 200 || typeof auth !== "string" || auth.length > 200) {
      return NextResponse.json({ error: "Geçersiz push aboneliği." }, { status: 400 });
    }

    const normalizedSubscription = {
      endpoint,
      expirationTime: typeof subscription?.expirationTime === "number" ? subscription.expirationTime : null,
      keys: { p256dh, auth },
    };
    const now = new Date();
    const collection = db.collection("push_subscriptions");
    await collection.updateOne(
      { endpoint },
      {
        $set: {
          user_id: user._id,
          endpoint,
          subscription: normalizedSubscription,
          user_agent: req.headers.get("user-agent") || undefined,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Push abonelik isteği çok büyük." }, { status: 413 });
    console.error("Push aboneliği kaydedilirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Push aboneliği kaydedilemedi." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { db, user } = await getUser(req);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const rateLimited = await enforceApiRateLimit(req, "push-unsubscribe", 30, 60 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;
    const body = await readJsonBody(req);
    const endpoint = isRecord(body) ? body.endpoint : undefined;
    if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) return NextResponse.json({ error: "Geçersiz abonelik endpoint’i." }, { status: 400 });
    await db.collection("push_subscriptions").deleteOne({ endpoint, user_id: user._id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Push abonelik isteği çok büyük." }, { status: 413 });
    console.error("Push aboneliği silinirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Push aboneliği silinemedi." }, { status: 500 });
  }
}
