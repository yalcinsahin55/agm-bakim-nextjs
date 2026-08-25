import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { notificationsCollection, usersCollection } from "@/lib/dbCollections";
import { withApiTiming } from "@/lib/performance";
import { getCachedUnreadCount, setCachedUnreadCount } from "@/lib/notificationUnreadCache";

export const dynamic = "force-dynamic";

async function getUnreadCount(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const rateLimited = await enforceApiRateLimit(req, "notifications-unread-count", 180, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const cachedUnreadCount = getCachedUnreadCount(user._id, fresh);
    if (cachedUnreadCount !== null) {
      return NextResponse.json(
        { unreadCount: cachedUnreadCount },
        { headers: { "Cache-Control": "private, no-store", "X-AGM-Cache": "HIT" } },
      );
    }

    const unreadCount = await notificationsCollection(db).countDocuments({ user_id: user._id, read_at: null });
    setCachedUnreadCount(user._id, unreadCount);
    return NextResponse.json(
      { unreadCount },
      { headers: { "Cache-Control": "private, no-store", "X-AGM-Cache": "MISS" } },
    );
  } catch (error) {
    console.error("Okunmamış bildirim sayısı alınırken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Okunmamış bildirim sayısı alınamadı." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/notifications/unread-count", () => getUnreadCount(req), { request: req });
}
