import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { syncMaintenanceNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const user = await getCurrentUser(req, db.collection("users") as any);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

    const notifications = await syncMaintenanceNotifications(db, user);
    const unreadCount = notifications.filter((notification) => !notification.read_at).length;
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Bildirimler yüklenirken hata:", error);
    return NextResponse.json({ error: "Bildirimler yüklenirken bir hata oluştu." }, { status: 500 });
  }
}
