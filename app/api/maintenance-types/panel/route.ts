import { enginesCollection, maintenanceTypesCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { buildItems } from "@/lib/status";
import { getMaintenancePanelServerCache, setMaintenancePanelServerCache, type ServerPanelPayload } from "@/lib/maintenancePanelServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();

  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const now = Date.now();
  const cachedPayload = getMaintenancePanelServerCache(now);
  if (cachedPayload) {
    return NextResponse.json(cachedPayload, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  const [engines, types] = await Promise.all([
    enginesCollection(db).find({}, {
      projection: { _id: 1, name: 1, hours: 1, load_kw: 1 },
    }).toArray(),
    maintenanceTypesCollection(db).find({ is_deleted: { $ne: true } }, {
      projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1, engine_states: 1 },
    }).toArray(),
  ]);
  const payload: ServerPanelPayload = { items: buildItems(engines, types), engines, types };
  setMaintenancePanelServerCache(payload, now);

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
