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
import { writeAuditLog } from "@/lib/audit";
import { MAX_SMALL_JSON_REQUEST_BYTES, parseJsonBodyLimited } from "@/lib/requestLimits";

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

  const bodyResult = await parseJsonBodyLimited(req, MAX_SMALL_JSON_REQUEST_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.tooLarge ? "Bakım türü isteği izin verilen boyutu aşıyor." : "Geçersiz bakım türü verisi." },
      { status: bodyResult.tooLarge ? 413 : 400 },
    );
  }
  const rawBody = bodyResult.value;
  const input = typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {};
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const default_period_hours = typeof input.default_period_hours === "number" ? input.default_period_hours : undefined;
  const apply_period_to_all = input.apply_period_to_all === true;
  const engine_states = input.engine_states;
  const remove_engine_ids = input.remove_engine_ids;
  const work_domains = input.work_domains;
  const allow_electromechanical_support = input.allow_electromechanical_support;
  const allow_electromechanical_responsible = input.allow_electromechanical_responsible;
  const restore = input.restore === true;

  const typesCol = maintenanceTypesCollection(db);
  const type = await typesCol.findOne({ _id: key });
  if (!type) return NextResponse.json({ error: "Bakım türü bulunamadı." }, { status: 404 });

  const beforeAudit = {
    key: String(type.key || key),
    label: type.label,
    default_period_hours: Number(type.default_period_hours || 0),
    engine_scope: type.engine_scope || null,
    work_domains: type.work_domains || [],
    allow_electromechanical_support: type.allow_electromechanical_support === true,
    allow_electromechanical_responsible: type.allow_electromechanical_responsible === true,
    is_deleted: type.is_deleted === true,
    engine_states: type.engine_states || {},
  };
  let auditChanged = false;
  const update: Partial<MaintenanceTypeDocument> = {};
  const unset: Record<string, ""> = {};
  if (restore === true) {
    update.is_deleted = false;
    unset.deleted_at = "";
    auditChanged = true;
  }
  if (label) {
    update.label = label;
    auditChanged = auditChanged || label !== type.label;
  }
  if (typeof default_period_hours === "number") {
    update.default_period_hours = default_period_hours;
    auditChanged = auditChanged || default_period_hours !== Number(type.default_period_hours || 0);
  }
  if (work_domains !== undefined) {
    update.work_domains = normalizeWorkDomains(work_domains, "mekanik");
    auditChanged = true;
  }
  if (allow_electromechanical_support !== undefined) {
    update.allow_electromechanical_support = allow_electromechanical_support === true;
    auditChanged = true;
  }
  if (allow_electromechanical_responsible !== undefined) {
    update.allow_electromechanical_responsible = allow_electromechanical_responsible === true;
    auditChanged = true;
  }
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
      auditChanged = true;
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
    auditChanged = true;
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
    auditChanged = true;
    const nextEngineStates = (isObjectRecord(currentEngineStates) ? { ...currentEngineStates } : {}) as MaintenanceTypeDocument["engine_states"];
    removeEngineIds.forEach((engineId) => { delete nextEngineStates[engineId]; });
    // Bir motor elle kapsamdan çıkarıldığında "all" kapsamı artık geçerli değildir.
    // explicit kapsam, yalnızca engine_states içinde bırakılan motorları gösterir.
    await typesCol.updateOne({ _id: key }, { $set: { engine_states: nextEngineStates, engine_scope: "explicit" } });
  }

  if (label && label.trim() !== type.label) {
    await recordsCollection(db).updateMany({ type_key: key }, { $set: { type_label: label.trim() } });
  }

  if (auditChanged) {
    const updatedType = await typesCol.findOne({ _id: key });
    const afterAudit = updatedType ? {
      key: String(updatedType.key || key),
      label: updatedType.label,
      default_period_hours: Number(updatedType.default_period_hours || 0),
      engine_scope: updatedType.engine_scope || null,
      work_domains: updatedType.work_domains || [],
      allow_electromechanical_support: updatedType.allow_electromechanical_support === true,
      allow_electromechanical_responsible: updatedType.allow_electromechanical_responsible === true,
      is_deleted: updatedType.is_deleted === true,
      engine_states: updatedType.engine_states || {},
    } : beforeAudit;
    await writeAuditLog(db, {
      user,
      action: "update",
      entity: "maintenance_type",
      entityId: key,
      summary: `${afterAudit.label} bakım türü güncellendi${restore === true ? " ve geri getirildi" : ""}`,
      before: beforeAudit,
      after: afterAudit,
    });
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
  const deletedAt = new Date();
  await maintenanceTypesCollection(db).updateOne(
    { _id: key },
    { $set: { is_deleted: true, deleted_at: deletedAt } },
  );
  await writeAuditLog(db, {
    user,
    action: "delete",
    entity: "maintenance_type",
    entityId: key,
    summary: `${type.label} bakım türü silindi (geçmiş kayıtlar korundu)`,
    before: { key, label: type.label, is_deleted: type.is_deleted === true, engine_scope: type.engine_scope || null },
    after: { key, label: type.label, is_deleted: true, deleted_at: deletedAt, engine_scope: type.engine_scope || null },
  });
  invalidateMaintenancePanelServerCache();
  return NextResponse.json({ ok: true, soft_deleted: true });
}
