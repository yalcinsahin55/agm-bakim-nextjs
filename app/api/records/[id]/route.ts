import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { canWriteMaintenance } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function recomputeLastMaintenance(db: Db, engineId: string, typeKey: string): Promise<void> {
  const recordsCol = db.collection("maintenance_records") as any;
  const all = await recordsCol.find({ engine_id: engineId, type_key: typeKey }).toArray();
  if (all.length === 0) return;
  const maxHour = Math.max(...all.map((r: any) => r.hour_at_completion));
  await (db.collection("maintenance_types") as any).updateOne(
    { _id: typeKey },
    { $set: { [`engine_states.${engineId}.last_maintenance_hour`]: maxHour } },
    { upsert: true }
  );
}

function canModify(user: any, record: any): boolean {
  return canWriteMaintenance(user.role) && (user.role === "yonetici" || record.technician_id === user._id);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const record = await (db.collection("maintenance_records") as any).findOne({ _id: new ObjectId(params.id) });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const recordsCol = db.collection("maintenance_records") as any;
  const record = await recordsCol.findOne({ _id: new ObjectId(params.id) });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok." }, { status: 403 });

  const body = await req.json();
  const { hour_at_completion, note, technician_note, photos_b64, photos, videos, pressure_reading, extra_types } = body;

  const update: Record<string, any> = {};
  if (typeof hour_at_completion === "number") update.hour_at_completion = hour_at_completion;
  if (typeof note === "string") update.note = note;
  if (typeof technician_note === "string") update.technician_note = technician_note;
  if (Array.isArray(photos_b64)) update.photos_b64 = photos_b64;
  if (Array.isArray(photos)) update.photos = photos;
  if (Array.isArray(videos)) update.videos = videos;
  if (typeof pressure_reading === "number") update.pressure_reading = pressure_reading;

  await recordsCol.updateOne({ _id: record._id }, { $set: update });
  await writeAuditLog(db, {
    user,
    action: "update",
    entity: "maintenance_record",
    entityId: params.id,
    summary: `${record.engine_name} · ${record.type_label} bakım kaydı güncellendi`,
    before: record,
    after: update,
  });

  if (typeof hour_at_completion === "number" && hour_at_completion !== record.hour_at_completion) {
    await recomputeLastMaintenance(db, record.engine_id, record.type_key);

    const enginesCol = db.collection("engines") as any;
    const engine = await enginesCol.findOne({ _id: record.engine_id });
    if (engine && hour_at_completion > engine.hours) {
      const stamp = new Date();
      await enginesCol.updateOne(
        { _id: record.engine_id },
        {
          $set: { hours: hour_at_completion, updated_at: stamp },
          $push: { history: { date: stamp.toISOString(), hours: hour_at_completion, load_kw: engine.load_kw || 0 } },
        }
      );
    }
  }

  // Bu kaydı düzenlerken birlikte tamamlanan ama daha önce hiç kaydedilmemiş başka bakımlar da ekleniyorsa,
  // her biri için ayrı kayıt oluşturulur ve aynı gruba bağlanır.
  if (Array.isArray(extra_types) && extra_types.length > 0) {
    let groupId = record.group_id;
    if (!groupId) {
      groupId = new ObjectId().toString();
      await recordsCol.updateOne({ _id: record._id }, { $set: { group_id: groupId } });
    }
    const finalHour = typeof hour_at_completion === "number" ? hour_at_completion : record.hour_at_completion;
    const typesCol = db.collection("maintenance_types") as any;

    for (const ex of extra_types) {
      if (typeof ex.period === "number") {
        await typesCol.updateOne(
          { _id: ex.type_key },
          { $set: { [`engine_states.${record.engine_id}.period_hours`]: ex.period } },
          { upsert: true }
        );
      }
      await recordsCol.insertOne({
        engine_id: record.engine_id, engine_name: record.engine_name,
        type_key: ex.type_key, type_label: ex.type_label,
        hour_at_completion: finalHour, note: "", technician_note: "",
        photos_b64: [], photos: [], videos: [],
        technician_id: user._id, technician_name: user.full_name,
        created_at: record.created_at, backdated: !!record.backdated,
        group_id: groupId, grouped_with: record.type_label,
      });
      await recomputeLastMaintenance(db, record.engine_id, ex.type_key);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const recordsCol = db.collection("maintenance_records") as any;
  const record = await recordsCol.findOne({ _id: new ObjectId(params.id) });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok." }, { status: 403 });

  await recordsCol.deleteOne({ _id: record._id });
  await recomputeLastMaintenance(db, record.engine_id, record.type_key);
  await writeAuditLog(db, {
    user,
    action: "delete",
    entity: "maintenance_record",
    entityId: params.id,
    summary: `${record.engine_name} · ${record.type_label} bakım kaydı silindi`,
    before: record,
  });

  return NextResponse.json({ ok: true });
}
