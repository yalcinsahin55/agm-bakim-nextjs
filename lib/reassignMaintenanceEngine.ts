import type { ClientSession, Db } from "mongodb";
import { buildEngineStateUpdate, recomputeLastMaintenance, snapshotTrackingState } from "@/lib/maintenance";
import { enginesCollection, maintenanceTypesCollection, recordsCollection } from "@/lib/dbCollections";
import type { MaintenanceRecordDocument } from "@/lib/dbTypes";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";

export interface ReassignMaintenanceEngineResult {
  changed: boolean;
  fromEngineIds: string[];
  toEngineId: string;
  toEngineName: string;
  movedRecordIds: string[];
  affectedTypeKeys: string[];
}

function recordId(value: unknown): string {
  return String(value || "");
}

function baseGroupFilter(record: MaintenanceRecordDocument): Record<string, unknown> {
  return record.group_id ? { group_id: record.group_id } : { _id: record._id };
}

/**
 * Yönetici düzeltmesi sırasında bir bakım olayını başka motora taşır.
 * Grouped bakımda olayın tüm kardeş kayıtları birlikte taşınır; eski motorların
 * tracking state’leri kalan kayıtlar üzerinden, yeni motorunki taşınan kayıtlar
 * üzerinden yeniden hesaplanır. Kullanıcının gönderdiği motor adı hiçbir zaman
 * güvenilir kabul edilmez; isim veritabanındaki motor belgesinden alınır.
 */
export async function reassignMaintenanceRecordEngine(
  db: Db,
  record: MaintenanceRecordDocument,
  requestedEngineId: string | undefined,
  session?: ClientSession,
): Promise<ReassignMaintenanceEngineResult> {
  const targetEngineId = requestedEngineId?.trim() || record.engine_id;
  const sessionOptions = session ? { session } : {};
  if (!isSafeMongoPathSegment(targetEngineId)) {
    throw new Error("Geçersiz motor kimliği.");
  }
  if (targetEngineId === record.engine_id) {
    return {
      changed: false,
      fromEngineIds: [record.engine_id],
      toEngineId: record.engine_id,
      toEngineName: record.engine_name,
      movedRecordIds: [recordId(record._id)],
      affectedTypeKeys: [record.type_key],
    };
  }

  const [targetEngine, groupedRecords] = await Promise.all([
    enginesCollection(db).findOne({ _id: targetEngineId }, { projection: { _id: 1, name: 1 }, ...sessionOptions }),
    recordsCollection(db).find(baseGroupFilter(record), {
      projection: { _id: 1, engine_id: 1, engine_name: 1, type_key: 1, tracking_state_before: 1, group_id: 1 },
      ...sessionOptions,
    }).toArray(),
  ]);
  if (!targetEngine) throw new Error("Yeni motor bulunamadı.");

  const sourceRecords = groupedRecords.length ? groupedRecords : [record];
  const fromEngineIds = [...new Set(sourceRecords.map((item) => String(item.engine_id || record.engine_id)).filter(Boolean))];
  const affectedTypeKeys = [...new Set(sourceRecords.map((item) => String(item.type_key || "")).filter(Boolean))];
  if (!affectedTypeKeys.length) throw new Error("Kayıtta geçerli bakım türü bulunamadı.");

  const sourceFallbacks = new Map<string, unknown>();
  sourceRecords.forEach((item) => {
    const key = `${String(item.engine_id || record.engine_id)}|${String(item.type_key || "")}`;
    if (!sourceFallbacks.has(key) && item.tracking_state_before !== undefined) sourceFallbacks.set(key, item.tracking_state_before);
  });

  const typeDocs = await maintenanceTypesCollection(db).find(
    { _id: { $in: affectedTypeKeys } },
    { projection: { _id: 1, engine_states: 1 }, ...sessionOptions },
  ).toArray();
  const typeByKey = new Map(typeDocs.map((item) => [String(item._id), item]));
  const targetFallbacks = new Map<string, unknown>();
  const targetRecordDerived = new Map<string, number | undefined>();
  for (const typeKey of affectedTypeKeys) {
    const typeDocument = typeByKey.get(typeKey);
    const state = typeDocument?.engine_states?.[targetEngineId];
    const snapshot = snapshotTrackingState(state);
    if (snapshot !== undefined) targetFallbacks.set(typeKey, snapshot);
    if (state === undefined) {
      const sourceState = typeDocument?.engine_states?.[record.engine_id];
      targetRecordDerived.set(typeKey, typeof sourceState?.period_hours === "number" ? sourceState.period_hours : undefined);
    }
  }

  const recordsCol = recordsCollection(db);
  const moveFilter = baseGroupFilter(record);
  const moveResult = await recordsCol.updateMany(moveFilter, {
    $set: { engine_id: targetEngineId, engine_name: String(targetEngine.name || targetEngineId) },
  }, sessionOptions);
  if (moveResult.matchedCount === 0) throw new Error("Bakım kaydı taşınırken kayıt bulunamadı.");

  // Her bakım türünün snapshot’ı motor bazlıdır. Yeni motorun eski manuel
  // state’i varsa silme sonrasında geri yüklenebilmesi için yeni snapshot yazılır;
  // yoksa eski motor snapshot’ı yanlışlıkla yeni motora taşınmaz.
  for (const typeKey of affectedTypeKeys) {
    const typeFilter = { ...moveFilter, type_key: typeKey };
    const snapshot = targetFallbacks.get(typeKey);
    if (snapshot !== undefined) {
      await recordsCol.updateMany(typeFilter, { $set: { tracking_state_before: snapshot } }, sessionOptions);
    } else {
      await recordsCol.updateMany(typeFilter, { $unset: { tracking_state_before: "" } }, sessionOptions);
    }
  }

  // Hedefte daha önce engine state yoksa bu hareketin oluşturduğu takip,
  // sonraki silme işleminde temizlenebilsin diye record kaynaklı işaretlenir.
  const typesCol = maintenanceTypesCollection(db);
  for (const [typeKey, periodHours] of targetRecordDerived) {
    const type = typeByKey.get(typeKey);
    await typesCol.updateOne(
      { _id: typeKey },
      { $set: buildEngineStateUpdate(type?.engine_states, targetEngineId, { tracking_source: "record", ...(periodHours !== undefined ? { period_hours: periodHours } : {}) }) },
      sessionOptions,
    );
  }

  for (const sourceEngineId of fromEngineIds) {
    if (!isSafeMongoPathSegment(sourceEngineId)) continue;
    for (const typeKey of affectedTypeKeys) {
      await recomputeLastMaintenance(db, sourceEngineId, typeKey, sourceFallbacks.get(`${sourceEngineId}|${typeKey}`), session);
    }
  }
  for (const typeKey of affectedTypeKeys) {
    await recomputeLastMaintenance(db, targetEngineId, typeKey, undefined, session);
  }

  const movedRecordIds = sourceRecords.map((item) => recordId(item._id)).filter(Boolean);
  return {
    changed: true,
    fromEngineIds,
    toEngineId: targetEngineId,
    toEngineName: String(targetEngine.name || targetEngineId),
    movedRecordIds,
    affectedTypeKeys,
  };
}
