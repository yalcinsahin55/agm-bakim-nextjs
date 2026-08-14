import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { buildItems } from "@/lib/status";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const db = await getDb();
  await seedIfEmpty(db);
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const engines = await db.collection("engines").find().toArray();
  const types = await db.collection("maintenance_types").find().toArray();
  const items = buildItems(engines, types);

  return NextResponse.json({ items, engines, types });
}
