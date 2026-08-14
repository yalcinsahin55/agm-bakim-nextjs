import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function recomputeLastMaintenance(db, engineId, typeKey) {
  const recordsCol = db.collection("maintenance_records");
  const all = await recordsCol.find({ engine_id: engineId, type_key: typeKey }).toArray();
  if (all.length === 0) return;
  const maxHour = Math.max(...all.map((r) => r.hour_at_completion));
  await db.collection("maintenance_types").updateOne(
    { _id: typeKey },
    { $set: { [`engine_states.${engineId}.last_maintenance_hour`]: maxHour } },
    { upsert: true }
  );
}

function canModify(user, record) {
  return ["yonetici", "planlamaci"].includes(user.role) || record.technician_id === user._id;
}

export async function PATCH(req, { params }) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const recordsCol = db.collection("maintenance_records");
  const record = await recordsCol.findOne({ _id: new ObjectId(params.id) });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok." }, { status: 403 });

  const body = await req.json();
  const { hour_at_completion, note, technician_note, photos_b64, videos, pressure_reading } = body;

  const update = {};
  if (typeof hour_at_completion === "number") update.hour_at_completion = hour_at_completion;
  if (typeof note === "string") update.note = note;
  if (typeof technician_note === "string") update.technician_note = technician_note;
  if (Array.isArray(photos_b64)) update.photos_b64 = photos_b64;
  if (Array.isArray(videos)) update.videos = videos;
  if (typeof pressure_reading === "number") update.pressure_reading = pressure_reading;

  await recordsCol.updateOne({ _id: record._id }, { $set: update });

  if (typeof hour_at_completion === "number" && hour_at_completion !== record.hour_at_completion) {
    await recomputeLastMaintenance(db, record.engine_id, record.type_key);

    const enginesCol = db.collection("engines");
    const engine = await enginesCol.findOne({ _id: record.engine_id });
    if (engine && hour_at_completion > engine.hours) {
      const stamp = new Date();
      await enginesCol.updateOne(
        { _id: record.engine_id },
        {
          $set: { hours: hour_at_completion, updated_at: stamp },
          $push: { history: { date: stamp.toISOString(), hours: hour_at_completion } },
        }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const recordsCol = db.collection("maintenance_records");
  const record = await recordsCol.findOne({ _id: new ObjectId(params.id) });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok." }, { status: 403 });

  await recordsCol.deleteOne({ _id: record._id });
  await recomputeLastMaintenance(db, record.engine_id, record.type_key);

  return NextResponse.json({ ok: true });
}
