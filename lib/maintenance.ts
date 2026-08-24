import { maintenanceTypesCollection, recordsCollection } from "@/lib/dbCollections";
import type { Db } from "mongodb";
import { isSafeMongoPathSegment } from "@/lib/mongoSecurity";

const MAX_RECOMPUTE_ATTEMPTS = 3;

type TrackingState = {
  last_maintenance_hour?: number;
  period_hours?: number;
  tracking_source?: "manual" | "record";
};

type EngineStatesRecord = Record<string, unknown>;

export function isObjectRecord(value: unknown): value is EngineStatesRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Mongo nested path yazımı yalnızca ara alanlar object olduğunda güvenlidir.
 * Legacy belgelerde null/array/string kalmışsa tüm engine_states alanını güvenli
 * bir object olarak yeniden kurmak için bu iki yardımcı kullanılır.
 */
export function canUpdateEngineStateNested(states: unknown, engineId: string): boolean {
  if (states === undefined) return true;
  if (!isObjectRecord(states)) return false;
  const current = states[engineId];
  return current === undefined || isObjectRecord(current);
}

export function mergeEngineState(
  states: unknown,
  engineId: string,
  patch: Record<string, unknown>,
): EngineStatesRecord {
  const merged: EngineStatesRecord = isObjectRecord(states) ? { ...states } : {};
  const current = isObjectRecord(merged[engineId]) ? merged[engineId] : {};
  merged[engineId] = { ...current, ...patch };
  return merged;
}

/**
 * Sağlam state’lerde atomik nested update kullanır; legacy state malformed ise
 * PathNotViable Mongo hatasını önlemek için tüm engine_states alanını object
 * olarak normalize eden bir `$set` parçası üretir.
 */
export function buildEngineStateUpdate(
  states: unknown,
  engineId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (canUpdateEngineStateNested(states, engineId)) {
    return Object.fromEntries(Object.entries(patch).map(([key, value]) => [`engine_states.${engineId}.${key}`, value]));
  }
  return { engine_states: mergeEngineState(states, engineId, patch) };
}

function normalizeTrackingState(state: unknown): TrackingState | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as Record<string, unknown>;
  const normalized: TrackingState = {};
  if (typeof candidate.last_maintenance_hour === "number" && Number.isFinite(candidate.last_maintenance_hour)) {
    normalized.last_maintenance_hour = candidate.last_maintenance_hour;
  }
  if (typeof candidate.period_hours === "number" && Number.isFinite(candidate.period_hours)) {
    normalized.period_hours = candidate.period_hours;
  }
  if (candidate.tracking_source === "manual" || candidate.tracking_source === "record") {
    normalized.tracking_source = candidate.tracking_source;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

/**
 * Kayıt oluşturulmadan önceki elle tanımlanmış motor-bakım durumunu güvenli
 * biçimde saklar. Kayıt kaynaklı durumlar geri yüklenmez; silme sırasında onlar
 * tamamen kaldırılmalıdır.
 */
export function snapshotTrackingState(state: unknown): TrackingState | undefined {
  const normalized = normalizeTrackingState(state);
  return normalized?.tracking_source === "record" ? undefined : normalized || undefined;
}

export async function recomputeLastMaintenance(
  db: Db,
  engineId: string,
  typeKey: string,
  fallbackState?: unknown,
): Promise<void> {
  if (!isSafeMongoPathSegment(engineId) || !isSafeMongoPathSegment(typeKey)) return;
  const recordsCol = recordsCollection(db);
  const typesCol = maintenanceTypesCollection(db);
  const recordFilter = { engine_id: engineId, type_key: typeKey };
  const statePath = `engine_states.${engineId}`;

  for (let attempt = 0; attempt < MAX_RECOMPUTE_ATTEMPTS; attempt += 1) {
    const latest = await recordsCol.findOne(
      recordFilter,
      {
        projection: { _id: 1, hour_at_completion: 1 },
        sort: { hour_at_completion: -1, maintenance_start_at: -1, created_at: -1 },
      },
    );
    const type = await typesCol.findOne(
      { _id: typeKey },
      { projection: { engine_states: 1 } },
    );
    const currentState = type?.engine_states?.[engineId];

    if (!latest) {
      // Yalnızca kayıt oluşturulurken otomatik açılmış takip silinir. Eski veya
      // yönetici tarafından bilinçli tanımlanmış takipler geriye dönük bozulmaz.
      const concurrentRecord = await recordsCol.findOne(recordFilter, { projection: { _id: 1 } });
      if (concurrentRecord) continue;
      if (currentState?.tracking_source === "record") {
        await typesCol.updateOne(
          { _id: typeKey, [`${statePath}.tracking_source`]: "record" },
          { $unset: { [statePath]: "" } },
        );
      } else {
        // Bir bakım kaydı, önceden elle tanımlanmış takibin son bakım saatini
        // geçici olarak değiştirdiyse ve sonra silindiyse eski planı geri yükle.
        // Snapshot yoksa eski veriyi varsayarak silmek yerine korumaya devam ederiz.
        const previousState = normalizeTrackingState(fallbackState);
        if (previousState) {
          await typesCol.updateOne(
            { _id: typeKey, ...(isObjectRecord(type?.engine_states) ? { [`${statePath}.tracking_source`]: { $ne: "record" } } : {}) },
            { $set: buildEngineStateUpdate(type?.engine_states, engineId, previousState) },
          );
        }
      }
      const recordAfterUpdate = await recordsCol.findOne(recordFilter, { projection: { _id: 1 } });
      if (recordAfterUpdate) continue;
      return;
    }

    const maxHour = typeof latest.hour_at_completion === "number" ? latest.hour_at_completion : 0;
    await typesCol.updateOne(
      { _id: typeKey },
      { $set: buildEngineStateUpdate(type?.engine_states, engineId, { last_maintenance_hour: maxHour }) },
    );

    // Yeni bir kayıt update ile aynı anda geldiyse ilk snapshot artık güncel
    // olmayabilir. Son snapshot değişmişse bir kez daha hesapla.
    const latestAfterUpdate = await recordsCol.findOne(
      recordFilter,
      {
        projection: { _id: 1 },
        sort: { hour_at_completion: -1, maintenance_start_at: -1, created_at: -1 },
      },
    );
    if (String(latestAfterUpdate?._id) === String(latest._id)) return;
  }

  console.warn("Bakım takibi yeniden hesaplanırken eşzamanlı değişiklikler devam ediyor; sonraki bakım işleminde tekrar hesaplanacak.", { engineId, typeKey });
}
