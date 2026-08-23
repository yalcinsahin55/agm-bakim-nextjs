import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { ensureAppIndexes } from "@/lib/dbIndexes";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await ensureAppIndexes(db);
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bakım kayıtlarını yalnızca yöneticiler teyit edebilir." }, { status: 403 });
  }
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Kayıt kimliği geçersiz." }, { status: 400 });
  }

  const recordsCol = db.collection("maintenance_records") as any;
  const recordId = new ObjectId(id);
  const record = await recordsCol.findOne({ _id: recordId });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (record.manager_confirmation_status === "confirmed") {
    return NextResponse.json({ ok: true, alreadyConfirmed: true, confirmed_at: record.manager_confirmed_at, confirmed_by_name: record.manager_confirmed_by_name, confirmed_ids: [id] });
  }
  if (record.manager_confirmation_status !== "pending") {
    return NextResponse.json({ error: "Bu kayıt yeni yönetici teyit akışına dahil değil." }, { status: 409 });
  }

  const confirmationScope = record.group_id
    ? { $or: [{ group_id: record.group_id }, { _id: recordId }] }
    : { _id: recordId };
  const pendingRecords = await recordsCol.find({ ...confirmationScope, manager_confirmation_status: "pending" }, { projection: { _id: 1, engine_name: 1, type_label: 1 } }).toArray();
  if (pendingRecords.length === 0) {
    const latest = await recordsCol.findOne({ _id: recordId }, { projection: { manager_confirmation_status: 1, manager_confirmed_at: 1, manager_confirmed_by_name: 1 } });
    return NextResponse.json({ ok: true, alreadyConfirmed: latest?.manager_confirmation_status === "confirmed", confirmed_at: latest?.manager_confirmed_at, confirmed_by_name: latest?.manager_confirmed_by_name, confirmed_ids: [id] });
  }

  const confirmedAt = new Date();
  const confirmation = {
    manager_confirmation_status: "confirmed",
    manager_confirmed_at: confirmedAt,
    manager_confirmed_by_id: user._id,
    manager_confirmed_by_name: user.full_name,
    manager_confirmed_by_role: user.role,
  };
  const result = await recordsCol.updateMany(
    { ...confirmationScope, manager_confirmation_status: "pending" },
    { $set: confirmation },
  );
  const confirmedIds = pendingRecords.map((item: { _id: ObjectId }) => String(item._id));
  const confirmedCount = Number(result.modifiedCount || 0);

  await writeAuditLog(db, {
    user,
    action: "update",
    entity: "maintenance_record",
    entityId: record.group_id || id,
    summary: `${record.engine_name} · ${record.type_label}${confirmedCount > 1 ? ` ve ${confirmedCount - 1} ilişkili bakım` : ""} yönetici tarafından teyit edildi`,
    before: { manager_confirmation_status: "pending", affected_record_count: pendingRecords.length },
    after: { ...confirmation, affected_record_count: confirmedCount },
  });

  return NextResponse.json({ ok: true, alreadyConfirmed: false, confirmed_at: confirmedAt, confirmed_by_name: user.full_name, confirmed_ids: confirmedIds, confirmed_count: confirmedCount });
}
