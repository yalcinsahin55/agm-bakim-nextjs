import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { usersCollection } from "@/lib/dbCollections";
import { getOrBuildMaintenancePanelServerPayload } from "@/lib/maintenancePanelServer";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();

  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(req, "maintenance-panel-read", 240, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const payload = await getOrBuildMaintenancePanelServerPayload(db);
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
