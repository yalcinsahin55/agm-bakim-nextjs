import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPublicVapidKey, isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(req, db.collection("users") as any);
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
    if (!isPushConfigured()) return NextResponse.json({ error: "Web Push henüz yapılandırılmamış." }, { status: 503 });

    const body = await req.json();
    const subscription = body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Geçersiz push aboneliği." }, { status: 400 });
    }

    const now = new Date();
    const collection = db.collection("push_subscriptions");
    await collection.createIndex({ endpoint: 1 }, { unique: true });
    await collection.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          user_id: user._id,
          endpoint: subscription.endpoint,
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
    console.error("Push aboneliği kaydedilirken hata:", error);
    return NextResponse.json({ error: "Push aboneliği kaydedilemedi." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { db, user } = await getUser(req);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const body = await req.json();
    const endpoint = body?.endpoint;
    if (!endpoint) return NextResponse.json({ error: "Abonelik endpoint’i gerekli." }, { status: 400 });
    await db.collection("push_subscriptions").deleteOne({ endpoint, user_id: user._id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push aboneliği silinirken hata:", error);
    return NextResponse.json({ error: "Push aboneliği silinemedi." }, { status: 500 });
  }
}
