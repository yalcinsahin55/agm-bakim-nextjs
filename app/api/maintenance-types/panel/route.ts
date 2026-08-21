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

  const engines = await (db.collection("engines") as any).find().toArray();
  const types = await (db.collection("maintenance_types") as any).find().toArray();
  const items = buildItems(engines, types);

  return NextResponse.json({ items, engines, types });
}
