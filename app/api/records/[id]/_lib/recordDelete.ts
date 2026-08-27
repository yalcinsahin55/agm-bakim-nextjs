import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordsCollection, usersCollection } from "@/lib/dbCollections";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { refreshUserMaintenanceNotificationsBestEffort } from "@/lib/notifications";
import { recomputeLastMaintenance } from "@/lib/maintenance";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { canModify, parseRecordId, type RecordRouteContext } from "./recordDetailHelpers";

export async function deleteRecord(req: NextRequest, { params }: RecordRouteContext) {
  const { id } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const rateLimited = await enforceApiRateLimit(req, "records-delete", 60, 10 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;
  await ensureAppIndexes(db);

  const recordId = parseRecordId(id);
  if (!recordId) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const recordsCol = recordsCollection(db);
  const record = await recordsCol.findOne({ _id: recordId });
  if (!record) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  if (!canModify(user, record)) return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok." }, { status: 403 });

  await recordsCol.deleteOne({ _id: record._id });
  await recomputeLastMaintenance(db, record.engine_id, record.type_key, record.tracking_state_before);
  await writeAuditLog(db, {
    user,
    action: "delete",
    entity: "maintenance_record",
    entityId: id,
    summary: `${record.engine_name} · ${record.type_label} bakım kaydı silindi; motor bakım takibi yeniden hesaplandı`,
    before: record,
  });

  invalidateMaintenancePanelServerCache();
  await refreshUserMaintenanceNotificationsBestEffort(db, user);
  return NextResponse.json({ ok: true });
}
