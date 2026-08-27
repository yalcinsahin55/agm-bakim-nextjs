import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { listUserNotificationsWithCurrentStatuses } from "@/lib/notifications";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { notificationsCollection, usersCollection } from "@/lib/dbCollections";
import { withApiTiming } from "@/lib/performance";
import { setCachedUnreadCount } from "@/lib/notificationUnreadCache";

export const dynamic = "force-dynamic";

async function getNotifications(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    // GET yalnızca okuma yapar. Bildirim senkronizasyonu ve temizlik,
    // `/api/notifications/refresh` altındaki korumalı POST route’undadır.
    if (req.nextUrl.searchParams.get("refresh") === "1") {
      return NextResponse.json({ error: "Bildirim yenileme için POST /api/notifications/refresh kullanın." }, { status: 405, headers: { Allow: "GET" } });
    }
    const rateLimited = await enforceApiRateLimit(req, "notifications-list", 120, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;
    const requestedLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") || "500", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 500, 1), 500);
    const [notifications, unreadCount] = await Promise.all([
      listUserNotificationsWithCurrentStatuses(db, user._id, limit),
      notificationsCollection(db).countDocuments({ user_id: user._id, read_at: null }),
    ]);
    setCachedUnreadCount(user._id, unreadCount);
    return NextResponse.json({ notifications, unreadCount, hasMore: notifications.length === limit });
  } catch (error) {
    console.error("Bildirimler yüklenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Bildirimler yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/notifications", () => getNotifications(req), { request: req });
}
