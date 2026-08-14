import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const engineId = searchParams.get("engine_id");
  const typeLabel = searchParams.get("type_label");
  const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

  const query = {};
  if (engineId) query.engine_id = engineId;
  if (typeLabel) query.type_label = typeLabel;

  const records = await db.collection("maintenance_records")
    .find(query).sort({ created_at: -1 }).limit(limit).toArray();

  return NextResponse.json(records);
}

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

export async function POST(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role === "goruntuleyici") {
    return NextResponse.json({ error: "Görüntüleyici rolü bakım tamamlayamaz." }, { status: 403 });
  }

  const body = await req.json();
  const {
    engine_id, type_key, type_label, hour_at_completion, note, technician_note,
    photos_b64, videos, pressure_reading, backdated, record_date, period, extra_types,
  } = body;

  if (!engine_id || !type_key || typeof hour_at_completion !== "number") {
    return NextResponse.json({ error: "Eksik veya geçersiz veri." }, { status: 400 });
  }

  const enginesCol = db.collection("engines");
  const typesCol = db.collection("maintenance_types");
  const recordsCol = db.collection("maintenance_records");

  const engine = await enginesCol.findOne({ _id: engine_id });
  if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

  const createdAt = backdated && record_date ? new Date(record_date) : new Date();

  async function insertOneRecord(tKey, tLabel) {
    const rec = {
      engine_id, engine_name: engine.name, type_key: tKey, type_label: tLabel,
      hour_at_completion, note: note || "", technician_note: technician_note || "",
      photos_b64: photos_b64 || [], videos: videos || [],
      technician_id: user._id, technician_name: user.full_name,
      created_at: createdAt, backdated: !!backdated,
    };
    if (typeof pressure_reading === "number") rec.pressure_reading = pressure_reading;
    await recordsCol.insertOne(rec);
    await recomputeLastMaintenance(db, engine_id, tKey);
  }

  if (typeof period === "number") {
    await typesCol.updateOne(
      { _id: type_key },
      { $set: { [`engine_states.${engine_id}.period_hours`]: period } },
      { upsert: true }
    );
  }
  await insertOneRecord(type_key, type_label);

  const completedLabels = [type_label];
  if (Array.isArray(extra_types)) {
    for (const ex of extra_types) {
      await insertOneRecord(ex.type_key, ex.type_label);
      completedLabels.push(ex.type_label);
    }
  }

  // Girilen saat motorun güncel saatinden büyükse motorun güncel saatini de günceller.
  if (hour_at_completion > engine.hours) {
    const stamp = new Date();
    await enginesCol.updateOne(
      { _id: engine_id },
      {
        $set: { hours: hour_at_completion, updated_at: stamp },
        $push: { history: { date: stamp.toISOString(), hours: hour_at_completion } },
      }
    );
  }

  return NextResponse.json({ ok: true, completed: completedLabels });
}
