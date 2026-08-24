import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { notificationsCollection } from "@/lib/dbCollections";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: notificationId } = await params;
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const rateLimited = await enforceApiRateLimit(req, "notification-read", 300, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const id = ObjectId.isValid(notificationId) ? new ObjectId(notificationId) : notificationId;
    const result = await notificationsCollection(db).updateOne(
      { _id: id, user_id: user._id },
      { $set: { read_at: new Date(), updated_at: new Date() } },
    );
    if (result.matchedCount === 0) return NextResponse.json({ error: "Bildirim bulunamadı." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Bildirim güncellenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Bildirim güncellenemedi." }, { status: 500 });
  }
}
