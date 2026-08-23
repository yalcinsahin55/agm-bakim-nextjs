import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { syncMaintenanceNotificationsForAllUsers } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz zamanlanmış görev." }, { status: 401 });
  }

  try {
    const db = await getDb();
    const result = await syncMaintenanceNotificationsForAllUsers(db);
    return NextResponse.json({ ok: true, ...result, refreshedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Cron bildirim yenileme hatası:", error);
    return NextResponse.json({ error: "Bildirimler yenilenemedi." }, { status: 500 });
  }
}
