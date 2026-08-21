import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { buildItems } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();

  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const engines = await (db.collection("engines") as any).find({}, {
    projection: { _id: 1, name: 1, hours: 1, load_kw: 1 },
  }).toArray();
  const types = await (db.collection("maintenance_types") as any).find({}, {
    projection: { _id: 1, key: 1, label: 1, default_period_hours: 1, engine_states: 1 },
  }).toArray();
  const items = buildItems(engines, types);

  return NextResponse.json({ items, engines, types });
}
