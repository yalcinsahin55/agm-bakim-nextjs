import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  const db = await getDb();
  await seedIfEmpty(db);
  const count = await (db.collection("engines") as any).countDocuments();
  return NextResponse.json({ ok: true, engine_count: count });
}
