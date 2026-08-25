import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { notificationsCollection, usersCollection } from "@/lib/dbCollections";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

async function getUnreadCount(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const rateLimited = await enforceApiRateLimit(req, "notifications-unread-count", 180, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const unreadCount = await notificationsCollection(db).countDocuments({ user_id: user._id, read_at: null });
    return NextResponse.json(
      { unreadCount },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Okunmamış bildirim sayısı alınırken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Okunmamış bildirim sayısı alınamadı." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/notifications/unread-count", () => getUnreadCount(req), { request: req });
}
