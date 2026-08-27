import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { syncMaintenanceNotificationsForAllUsers } from "@/lib/notifications";
import { logOperationalEvent, withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

async function refreshCron(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz zamanlanmış görev." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const startedAt = Date.now();
  try {
    const db = await getDb();
    const result = await syncMaintenanceNotificationsForAllUsers(db);
    logOperationalEvent("info", "cron_refresh_succeeded", {
      users: result.users,
      actionable: result.actionable,
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ ok: true, ...result, refreshedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logOperationalEvent("error", "cron_refresh_failed", {
      error_code: "CRON_REFRESH_FAILED",
      error_name: error instanceof Error ? error.name : "UnknownError",
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Bildirimler yenilenemedi." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/cron/refresh", () => refreshCron(req), { request: req, source: "cron" });
}
