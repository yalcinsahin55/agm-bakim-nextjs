import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { normalizeWorkDomains } from "@/lib/technicians";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }
  const rateLimited = enforceApiRateLimit(req, "maintenance-type-change", 60, 60 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const { label, default_period_hours, apply_period_to_all, engine_states, remove_engine_ids, work_domains, allow_electromechanical_support, allow_electromechanical_responsible, restore } = await req.json();

  const typesCol = db.collection("maintenance_types") as any;
  const type = await typesCol.findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  const update: Record<string, any> = {};
  const unset: Record<string, ""> = {};
  if (restore === true) {
    update.is_deleted = false;
    unset.deleted_at = "";
  }
  if (label) update.label = label.trim();
  if (typeof default_period_hours === "number") update.default_period_hours = default_period_hours;
  if (work_domains !== undefined) update.work_domains = normalizeWorkDomains(work_domains, "mekanik");
  if (allow_electromechanical_support !== undefined) update.allow_electromechanical_support = allow_electromechanical_support === true;
  if (allow_electromechanical_responsible !== undefined) update.allow_electromechanical_responsible = allow_electromechanical_responsible === true;
  if (Object.keys(update).length || Object.keys(unset).length) {
    const updateOperation: Record<string, Record<string, unknown>> = {};
    if (Object.keys(update).length) updateOperation.$set = update;
    if (Object.keys(unset).length) updateOperation.$unset = unset;
    await typesCol.updateOne({ _id: key }, updateOperation);
  }

  if (apply_period_to_all && typeof default_period_hours === "number") {
    const engineIds = Object.keys(type.engine_states || {});
    for (const engId of engineIds) {
      if (!isSafeMongoPathSegment(engId)) continue;
      await typesCol.updateOne({ _id: key }, { $set: { [`engine_states.${engId}.period_hours`]: default_period_hours, [`engine_states.${engId}.tracking_source`]: "manual" } });
    }
  }

  // 🎯 Motor bazlı periyot / son bakım saati düzeltme (yeni özellik)
  if (engine_states && typeof engine_states === "object") {
    for (const [engId, st] of Object.entries(engine_states as Record<string, any>)) {
      if (!isSafeMongoPathSegment(engId)) continue;
      const set: Record<string, any> = {};
      if (typeof st?.period_hours === "number") set[`engine_states.${engId}.period_hours`] = st.period_hours;
      if (typeof st?.last_maintenance_hour === "number") set[`engine_states.${engId}.last_maintenance_hour`] = st.last_maintenance_hour;
      set[`engine_states.${engId}.tracking_source`] = "manual";
      if (Object.keys(set).length) await typesCol.updateOne({ _id: key }, { $set: set });
    }
  }

  const removeEngineIds = Array.isArray(remove_engine_ids)
    ? [...new Set(remove_engine_ids.filter((id: unknown): id is string => isSafeMongoPathSegment(id)))]
    : [];
  if (removeEngineIds.length > 0) {
    const unset: Record<string, ""> = {};
    removeEngineIds.forEach((engineId) => { unset[`engine_states.${engineId}`] = ""; });
    // Bir motor elle kapsamdan çıkarıldığında "all" kapsamı artık geçerli değildir.
    // explicit kapsam, yalnızca engine_states içinde bırakılan motorları gösterir.
    await typesCol.updateOne({ _id: key }, { $unset: unset, $set: { engine_scope: "explicit" } });
  }

  if (label && label.trim() !== type.label) {
    await (db.collection("maintenance_records") as any).updateMany({ type_key: key }, { $set: { type_label: label.trim() } });
  }

  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }
  const rateLimited = enforceApiRateLimit(req, "maintenance-type-change", 60, 60 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const type = await (db.collection("maintenance_types") as any).findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  // Geçmiş bakım kayıtları hiçbir koşulda silinmez. Tür yalnızca gizlenir;
  // böylece yanlış silme durumunda tarihçe ve raporlar korunur.
  await (db.collection("maintenance_types") as any).updateOne(
    { _id: key },
    { $set: { is_deleted: true, deleted_at: new Date() } },
  );
  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true, soft_deleted: true });
}
