import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { recordSchema, formatZodError } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
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
  } catch (error) {
    console.error("GET /api/records hatası:", error);
    return NextResponse.json({ error: "Kayıtlar getirilirken bir hata oluştu." }, { status: 500 });
  }
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
  try {
    const db = await getDb();
    const usersCol = db.collection("users");
    const user = await getCurrentUser(req, usersCol);
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    if (user.role === "goruntuleyici") {
      return NextResponse.json({ error: "Görüntüleyici rolü bakım tamamlayamaz." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // 🔒 Zod validasyonu: bozuk veri kapıdan geçemez
    const parsed = recordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const {
      engine_id, type_key, type_label, hour_at_completion, note, technician_note,
      photos_b64, videos, pressure_reading, backdated, record_date, period, extra_types,
    } = parsed.data;

    const enginesCol = db.collection("engines");
    const typesCol = db.collection("maintenance_types");
    const recordsCol = db.collection("maintenance_records");

    const engine = await enginesCol.findOne({ _id: engine_id });
    if (!engine) return NextResponse.json({ error: "Motor bulunamadı." }, { status: 404 });

    const createdAt = backdated && record_date ? new Date(record_date) : new Date();
    const groupId = new ObjectId().toString();

    async function insertOneRecord(tKey, tLabel, isPrimary) {
      const rec = {
        engine_id, engine_name: engine.name, type_key: tKey, type_label: tLabel,
        hour_at_completion,
        note: isPrimary ? (note || "") : "",
        technician_note: isPrimary ? (technician_note || "") : "",
        photos_b64: isPrimary ? (photos_b64 || []) : [],
        videos: isPrimary ? (videos || []) : [],
        technician_id: user._id, technician_name: user.full_name,
        created_at: createdAt, backdated: !!backdated,
        group_id: groupId, grouped_with: isPrimary ? null : tLabel,
      };
      if (isPrimary && typeof pressure_reading === "number") rec.pressure_reading = pressure_reading;
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
    await insertOneRecord(type_key, type_label, true);

    const completedLabels = [type_label];
    if (Array.isArray(extra_types)) {
      for (const ex of extra_types) {
        if (typeof ex.period === "number") {
          await typesCol.updateOne(
            { _id: ex.type_key },
            { $set: { [`engine_states.${engine_id}.period_hours`]: ex.period } },
            { upsert: true }
          );
        }
        await insertOneRecord(ex.type_key, ex.type_label, false);
        completedLabels.push(ex.type_label);
      }
    }

    if (hour_at_completion > engine.hours) {
      const stamp = new Date();
      await enginesCol.updateOne(
        { _id: engine_id },
        {
          $set: { hours: hour_at_completion, updated_at: stamp },
          $push: { history: { date: stamp.toISOString(), hours: hour_at_completion, load_kw: engine.load_kw || 0 } },
        }
      );
    }

    return NextResponse.json({ ok: true, completed: completedLabels });
  } catch (error) {
    console.error("POST /api/records hatası:", error);
    return NextResponse.json({ error: "Bakım kaydı oluşturulurken bir hata oluştu." }, { status: 500 });
  }
}
