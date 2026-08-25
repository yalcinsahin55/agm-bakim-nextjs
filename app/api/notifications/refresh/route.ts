import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { syncMaintenanceNotifications } from "@/lib/notifications";
import { withApiTiming } from "@/lib/performance";
import { notificationsCollection, usersCollection } from "@/lib/dbCollections";

export const dynamic = "force-dynamic";

async function refreshNotifications(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const rateLimited = await enforceApiRateLimit(req, "notifications-refresh", 12, 10 * 60 * 1000, user._id);
    if (rateLimited) return rateLimited;

    const [notifications, unreadCount] = await Promise.all([
      syncMaintenanceNotifications(db, user),
      notificationsCollection(db).countDocuments({ user_id: user._id, read_at: null }),
    ]);
    return NextResponse.json({ notifications, unreadCount, hasMore: notifications.length >= 500 });
  } catch (error) {
    console.error("Bildirimler yenilenirken hata:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Bildirimler yenilenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/notifications/refresh", () => refreshNotifications(req), { request: req });
}
