import { maintenanceTypesCollection, recordsCollection, usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { normalizeWorkDomains } from "@/lib/technicians";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";
import { invalidateMaintenancePanelServerCache } from "@/lib/maintenancePanelServer";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";
import { buildEngineStateUpdate, canUpdateEngineStateNested, isObjectRecord, mergeEngineState } from "@/lib/maintenance";
import type { MaintenanceTypeDocument } from "@/lib/dbTypes";

export const dynamic = "force-dynamic";

type EngineStateInput = { period_hours?: unknown; last_maintenance_hour?: unknown };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "maintenance-type-change", 60, 60 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const { label, default_period_hours, apply_period_to_all, engine_states, remove_engine_ids, work_domains, allow_electromechanical_support, allow_electromechanical_responsible, restore } = await req.json();

  const typesCol = maintenanceTypesCollection(db);
  const type = await typesCol.findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  const update: Partial<MaintenanceTypeDocument> = {};
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
    const updateOperation: { $set?: Partial<MaintenanceTypeDocument>; $unset?: Record<string, ""> } = {};
    if (Object.keys(update).length) updateOperation.$set = update;
    if (Object.keys(unset).length) updateOperation.$unset = unset;
    await typesCol.updateOne({ _id: key }, updateOperation);
  }

  let currentEngineStates: unknown = type.engine_states;
  const applyEngineStatePatches = async (patches: Array<{ engineId: string; patch: Record<string, unknown> }>) => {
    if (patches.length === 0) return;
    const canBulkWriteNested = patches.every(({ engineId }) => canUpdateEngineStateNested(currentEngineStates, engineId));
    if (canBulkWriteNested) {
      await typesCol.bulkWrite(patches.map(({ engineId, patch }) => ({
        updateOne: { filter: { _id: key }, update: { $set: buildEngineStateUpdate(currentEngineStates, engineId, patch) } },
      })));
      patches.forEach(({ engineId, patch }) => {
        currentEngineStates = mergeEngineState(currentEngineStates, engineId, patch);
      });
      return;
    }
    // Malformed legacy engine_states belgelerinde buildEngineStateUpdate tüm alanı
    // güvenli biçimde yeniden kurar; bu durumda sıralı fallback veri kaybını önler.
    for (const { engineId, patch } of patches) {
      await typesCol.updateOne({ _id: key }, { $set: buildEngineStateUpdate(currentEngineStates, engineId, patch) });
      currentEngineStates = mergeEngineState(currentEngineStates, engineId, patch);
    }
  };

  if (apply_period_to_all && typeof default_period_hours === "number") {
    const patches = Object.keys(isObjectRecord(currentEngineStates) ? currentEngineStates : {})
      .filter(isSafeMongoPathSegment)
      .map((engineId) => ({ engineId, patch: { period_hours: default_period_hours, tracking_source: "manual" } }));
    await applyEngineStatePatches(patches);
  }

  // 🎯 Motor bazlı periyot / son bakım saati düzeltme (yeni özellik)
  if (isObjectRecord(engine_states)) {
    const patches = Object.entries(engine_states)
      .filter(([engineId]) => isSafeMongoPathSegment(engineId))
      .map(([engineId, rawState]) => {
        const state = rawState && typeof rawState === "object" ? rawState as EngineStateInput : {};
        const patch: Record<string, unknown> = { tracking_source: "manual" };
        if (typeof state.period_hours === "number") patch.period_hours = state.period_hours;
        if (typeof state.last_maintenance_hour === "number") patch.last_maintenance_hour = state.last_maintenance_hour;
        return { engineId, patch };
      });
    await applyEngineStatePatches(patches);
  }

  const removeEngineIds = Array.isArray(remove_engine_ids)
    ? [...new Set(remove_engine_ids.filter((id: unknown): id is string => isSafeMongoPathSegment(id)))]
    : [];
  if (removeEngineIds.length > 0) {
    const nextEngineStates = (isObjectRecord(currentEngineStates) ? { ...currentEngineStates } : {}) as MaintenanceTypeDocument["engine_states"];
    removeEngineIds.forEach((engineId) => { delete nextEngineStates[engineId]; });
    // Bir motor elle kapsamdan çıkarıldığında "all" kapsamı artık geçerli değildir.
    // explicit kapsam, yalnızca engine_states içinde bırakılan motorları gösterir.
    await typesCol.updateOne({ _id: key }, { $set: { engine_states: nextEngineStates, engine_scope: "explicit" } });
  }

  if (label && label.trim() !== type.label) {
    await recordsCollection(db).updateMany({ type_key: key }, { $set: { type_label: label.trim() } });
  }

  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (user.role !== "yonetici") {
    return NextResponse.json({ error: "Bu işlem yalnızca yöneticiler içindir." }, { status: 403 });
  }
  const rateLimited = await enforceApiRateLimit(req, "maintenance-type-change", 60, 60 * 60 * 1000, user._id);
  if (rateLimited) return rateLimited;

  const type = await maintenanceTypesCollection(db).findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  // Geçmiş bakım kayıtları hiçbir koşulda silinmez. Tür yalnızca gizlenir;
  // böylece yanlış silme durumunda tarihçe ve raporlar korunur.
  await maintenanceTypesCollection(db).updateOne(
    { _id: key },
    { $set: { is_deleted: true, deleted_at: new Date() } },
  );
  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true, soft_deleted: true });
}
