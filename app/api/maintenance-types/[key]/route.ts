import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }

  const { key } = params;
  const { label, default_period_hours, apply_period_to_all } = await req.json();

  const typesCol = db.collection("maintenance_types") as any;
  const type = await typesCol.findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  const update: Record<string, any> = {};
  if (label) update.label = label.trim();
  if (typeof default_period_hours === "number") update.default_period_hours = default_period_hours;
  await typesCol.updateOne({ _id: key }, { $set: update });

  if (apply_period_to_all && typeof default_period_hours === "number") {
    const engineIds = Object.keys(type.engine_states || {});
    for (const engId of engineIds) {
      await typesCol.updateOne({ _id: key }, { $set: { [`engine_states.${engId}.period_hours`]: default_period_hours } });
    }
  }

  if (label && label.trim() !== type.label) {
    await (db.collection("maintenance_records") as any).updateMany({ type_key: key }, { $set: { type_label: label.trim() } });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { key: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }

  const { key } = params;
  await (db.collection("maintenance_records") as any).deleteMany({ type_key: key });
  await (db.collection("maintenance_types") as any).deleteOne({ _id: key });
  return NextResponse.json({ ok: true });
}
