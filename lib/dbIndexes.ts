import type { Db } from "mongodb";
import { logOperationalEvent } from "@/lib/performance";

// Serverless sıcak instance içinde aynı indeks kurulumunu tekrar tekrar çalıştırma.
// Her indeks ayrı yakalanır; mevcut veride bir çakışma olması tüm uygulamayı kilitlemez,
// ancak artık structured log ve health endpoint üzerinden görünür olur.
declare global {
  var _agmIndexPromise: Promise<void> | undefined;
  var _agmIndexStatus: AppIndexStatus | undefined;
}

export type AppIndexStatus = {
  state: "initializing" | "ready" | "degraded";
  failed_count: number;
  failed_indexes: string[];
  checked_at: string | null;
};

type IndexCreationResult = { ok: boolean; label: string };

function indexLabel(keys: Record<string, 1 | -1>, options?: Record<string, unknown>): string {
  const named = options?.name;
  if (typeof named === "string" && named.length > 0 && named.length <= 120) return named;
  return Object.entries(keys).map(([key, direction]) => `${key}:${direction}`).join(",").slice(0, 120);
}

async function createIndexSafely(
  collection: ReturnType<Db["collection"]>,
  keys: Record<string, 1 | -1>,
  options?: Record<string, unknown>,
): Promise<IndexCreationResult> {
  const label = indexLabel(keys, options);
  try {
    await collection.createIndex(keys, options as never);
    return { ok: true, label };
  } catch (error) {
    logOperationalEvent("error", "db_index_error", {
      index: label,
      error_code: "DB_INDEX_CREATE_FAILED",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false, label };
  }
}

export function getAppIndexStatus(): AppIndexStatus {
  const status = global._agmIndexStatus || {
    state: "initializing",
    failed_count: 0,
    failed_indexes: [],
    checked_at: null,
  } satisfies AppIndexStatus;
  return { ...status, failed_indexes: [...status.failed_indexes] };
}

export function ensureAppIndexes(db: Db): Promise<void> {
  if (!global._agmIndexPromise) {
    const records = db.collection("maintenance_records");
    const notifications = db.collection("notifications");
    const auditLogs = db.collection("audit_logs");
    const users = db.collection("users");
    const pushSubscriptions = db.collection("push_subscriptions");
    const videoChunks = db.collection("video_chunks");
    const oilAnalyses = db.collection("oil_analyses");
    const pressureReadings = db.collection("pressure_readings");
    const engines = db.collection("engines");
    const equipmentInfo = db.collection("equipment_info");

    global._agmIndexStatus = {
      state: "initializing",
      failed_count: 0,
      failed_indexes: [],
      checked_at: null,
    };

    global._agmIndexPromise = Promise.all([
      createIndexSafely(records, { engine_id: 1, type_label: 1, created_at: -1 }),
      createIndexSafely(records, { engine_id: 1, created_at: -1 }, { name: "records_engine_created_at" }),
      createIndexSafely(records, { created_at: -1 }),
      createIndexSafely(records, { created_at: -1, _id: -1 }, { name: "records_created_at_id_desc" }),
      createIndexSafely(records, { engine_id: 1, type_key: 1, created_at: 1 }, { name: "records_engine_type_created_at" }),
      createIndexSafely(records, { engine_id: 1, type_key: 1, hour_at_completion: -1 }, { name: "records_engine_type_hour_desc" }),
      createIndexSafely(records, { maintenance_start_at: -1, created_at: -1, _id: -1 }, { name: "records_maintenance_date_desc" }),
      createIndexSafely(records, { engine_id: 1, maintenance_start_at: -1, created_at: -1, _id: -1 }, { name: "records_engine_maintenance_date_desc" }),
      createIndexSafely(records, { type_key: 1, maintenance_start_at: -1, created_at: -1, _id: -1 }, { name: "records_type_maintenance_date_desc" }),
      createIndexSafely(records, { manager_confirmation_status: 1, maintenance_start_at: -1, created_at: -1, _id: -1 }, { name: "records_confirmation_maintenance_date_desc" }),
      createIndexSafely(records, { technician_id: 1, created_at: -1 }, { name: "records_technician_created_at" }),
      createIndexSafely(records, { technician_source: 1, technician_id: 1, created_at: -1 }, { name: "records_technician_source_id_created_at" }),
      createIndexSafely(records, { photos: 1 }, { name: "records_photos_media_url" }),
      createIndexSafely(records, { videos: 1 }, { name: "records_videos_legacy_media_url" }),
      createIndexSafely(records, { "videos.url": 1 }, { name: "records_videos_url_media_url" }),
      createIndexSafely(records, { manager_confirmation_status: 1, created_at: -1 }, { name: "records_manager_confirmation_created_at" }),
      createIndexSafely(records, { group_id: 1, manager_confirmation_status: 1 }, { name: "records_group_confirmation_status" }),
      createIndexSafely(records, { client_request_id: 1 }, { unique: true, sparse: true }),
      createIndexSafely(notifications, { user_id: 1, read_at: 1, created_at: -1 }),
      createIndexSafely(notifications, { user_id: 1, sort_at: -1, created_at: -1, _id: -1 }, { name: "notifications_user_sort_at_desc" }),
      createIndexSafely(notifications, { dedupe_key: 1 }, { unique: true, sparse: true }),
      createIndexSafely(auditLogs, { created_at: -1 }),
      createIndexSafely(auditLogs, { user_id: 1, created_at: -1 }),
      createIndexSafely(auditLogs, { action: 1, created_at: -1 }),
      createIndexSafely(auditLogs, { entity: 1, created_at: -1 }),
      createIndexSafely(auditLogs, { entity: 1, entity_id: 1, created_at: -1 }),
      createIndexSafely(users, { phone_normalized: 1 }, { unique: true, sparse: true, name: "users_phone_normalized_unique" }),
      createIndexSafely(users, { stable_id: 1 }, { unique: true, sparse: true, name: "users_stable_id_unique" }),
      createIndexSafely(engines, { stable_id: 1 }, { unique: true, sparse: true, name: "engines_stable_id_unique" }),
      createIndexSafely(equipmentInfo, { stable_id: 1 }, { unique: true, sparse: true, name: "equipment_info_stable_id_unique" }),
      createIndexSafely(users, { bootstrap_key: 1 }, { unique: true, sparse: true, name: "users_first_bootstrap_unique" }),
      createIndexSafely(users, { role: 1, active: 1, approved: 1 }, { name: "users_technician_lookup" }),
      createIndexSafely(pushSubscriptions, { endpoint: 1 }, { unique: true }),
      createIndexSafely(videoChunks, { upload_id: 1, index: 1 }, { name: "video_chunks_upload_index" }),
      createIndexSafely(videoChunks, { upload_id: 1, owner_id: 1, index: 1 }, { name: "video_chunks_owner_upload_index" }),
      createIndexSafely(videoChunks, { at: 1 }, { expireAfterSeconds: 24 * 60 * 60, name: "video_chunks_at_ttl" }),
      createIndexSafely(oilAnalyses, { engine_id: 1, analysis_date: -1, created_at: -1 }, { name: "oil_analyses_engine_date_desc" }),
      createIndexSafely(oilAnalyses, { analysis_date: -1, created_at: -1 }, { name: "oil_analyses_date_desc" }),
      createIndexSafely(pressureReadings, { engine_id: 1, reading_date: 1, created_at: 1 }, { name: "pressure_readings_engine_date_asc" }),
      createIndexSafely(pressureReadings, { reading_date: 1, created_at: 1 }, { name: "pressure_readings_date_asc" }),
    ]).then((results) => {
      const failedIndexes = results.filter((result) => !result.ok).map((result) => result.label);
      global._agmIndexStatus = {
        state: failedIndexes.length > 0 ? "degraded" : "ready",
        failed_count: failedIndexes.length,
        failed_indexes: failedIndexes.slice(0, 20),
        checked_at: new Date().toISOString(),
      };
      if (failedIndexes.length > 0) {
        logOperationalEvent("error", "db_index_bootstrap_degraded", {
          error_code: "DB_INDEX_BOOTSTRAP_DEGRADED",
          failed_count: failedIndexes.length,
          failed_indexes: failedIndexes.slice(0, 20),
        });
      } else {
        logOperationalEvent("info", "db_index_bootstrap_ready", { index_count: results.length });
      }
    });
  }

  return global._agmIndexPromise;
}
