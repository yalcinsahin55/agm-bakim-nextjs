import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPublicVapidKey, isPushConfigured } from "@/lib/push";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { isAllowedPushEndpoint } from "@/lib/pushSecurity";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, usersCollection(db));
  return { db, user };
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

    const body = await req.json();
    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!isAllowedPushEndpoint(endpoint) || typeof p256dh !== "string" || p256dh.length > 200 || typeof auth !== "string" || auth.length > 200) {
      return NextResponse.json({ error: "Geçersiz push aboneliği." }, { status: 400 });
    }

    const now = new Date();
    const collection = db.collection("push_subscriptions");
    await collection.updateOne(
      { endpoint },
      {
        $set: {
          user_id: user._id,
          endpoint,
          subscription,
          user_agent: req.headers.get("user-agent") || undefined,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
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
    const body = await req.json();
    const endpoint = body?.endpoint;
    if (!isAllowedPushEndpoint(endpoint)) return NextResponse.json({ error: "Geçersiz abonelik endpoint’i." }, { status: 400 });
    await db.collection("push_subscriptions").deleteOne({ endpoint, user_id: user._id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push aboneliği silinirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Push aboneliği silinemedi." }, { status: 500 });
  }
}
