import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { buildItems, type PanelItem } from "@/lib/status";
import type { MaintenanceType } from "@/lib/types";
import type { PanelEngine } from "@/lib/maintenancePanel";

export const dynamic = "force-dynamic";

interface PanelPayload {
  items: PanelItem[];
  engines: PanelEngine[];
  types: MaintenanceType[];
}

let panelCache: { payload: PanelPayload; expiresAt: number } | null = null;
const PANEL_CACHE_TTL_MS = 10_000;

export async function GET(req: NextRequest) {
  const db = await getDb();

  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const now = Date.now();
  if (panelCache && panelCache.expiresAt > now) {
    return NextResponse.json(panelCache.payload, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  const [engines, types] = await Promise.all([
    (db.collection("engines") as any).find({}, {
      projection: { _id: 1, name: 1, hours: 1, load_kw: 1 },
    }).toArray(),
    (db.collection("maintenance_types") as any).find({}, {
      projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_scope: 1, work_domains: 1, allow_electromechanical_support: 1, allow_electromechanical_responsible: 1, engine_states: 1 },
    }).toArray(),
  ]);
  const payload: PanelPayload = { items: buildItems(engines, types), engines, types };
  panelCache = { payload, expiresAt: now + PANEL_CACHE_TTL_MS };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
