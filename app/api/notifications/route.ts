import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { listUserNotifications, syncMaintenanceNotifications } from "@/lib/notifications";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

async function getNotifications(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, db.collection("users") as any);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const notifications = refresh
      ? await syncMaintenanceNotifications(db, user)
      : await listUserNotifications(db, user._id);
    const unreadCount = notifications.filter((notification) => !notification.read_at).length;
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Bildirimler yüklenirken hata:", error);
    return NextResponse.json({ error: "Bildirimler yüklenirken bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/notifications", () => getNotifications(req));
}
