import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import equipmentSeed from "@/lib/equipment_info.json";

export const dynamic = "force-dynamic";

async function seedEquipmentIfEmpty(db) {
  const col = db.collection("equipment_info");
  const count = await col.countDocuments();
  if (count > 0) return;
  const ops = Object.entries(equipmentSeed).map(([name, info]) => ({
    updateOne: { filter: { _id: name }, update: { $setOnInsert: { ...info, engine_name: name } }, upsert: true },
  }));
  if (ops.length) await col.bulkWrite(ops);
}

export async function GET(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  await seedEquipmentIfEmpty(db);
  const items = await db.collection("equipment_info").find().toArray();
  return NextResponse.json(items);
}
