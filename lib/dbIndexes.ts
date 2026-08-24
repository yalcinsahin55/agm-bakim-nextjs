import type { Db } from "mongodb";

// Serverless sıcak instance içinde aynı indeks kurulumunu tekrar tekrar çalıştırma.
// Her indeks ayrı yakalanır; mevcut veride bir çakışma olması tüm uygulamayı kilitlememelidir.
declare global {
  // eslint-disable-next-line no-var
  var _agmIndexPromise: Promise<void> | undefined;
}

async function createIndexSafely(
  collection: ReturnType<Db["collection"]>,
  keys: Record<string, 1 | -1>,
  options?: Record<string, unknown>,
): Promise<void> {
  try {
    await collection.createIndex(keys, options as never);
  } catch (error) {
    console.warn("[DB indexes] Index hazırlanamadı; mevcut index/veri kontrol edilmeli:", error instanceof Error ? error.name : "UnknownError");
  }
}

export function ensureAppIndexes(db: Db): Promise<void> {
  if (!global._agmIndexPromise) {
    const records = db.collection("maintenance_records");
    const notifications = db.collection("notifications");
    const auditLogs = db.collection("audit_logs");
    const users = db.collection("users");
    const pushSubscriptions = db.collection("push_subscriptions");
    const videoChunks = db.collection("video_chunks");

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
      createIndexSafely(records, { manager_confirmation_status: 1, created_at: -1 }, { name: "records_manager_confirmation_created_at" }),
      createIndexSafely(records, { group_id: 1, manager_confirmation_status: 1 }, { name: "records_group_confirmation_status" }),
      createIndexSafely(records, { client_request_id: 1 }, { unique: true, sparse: true }),
      createIndexSafely(notifications, { user_id: 1, read_at: 1, created_at: -1 }),
      createIndexSafely(notifications, { dedupe_key: 1 }, { unique: true, sparse: true }),
      createIndexSafely(auditLogs, { created_at: -1 }),
      createIndexSafely(auditLogs, { user_id: 1, created_at: -1 }),
      createIndexSafely(auditLogs, { action: 1, created_at: -1 }),
      createIndexSafely(auditLogs, { entity: 1, created_at: -1 }),
      createIndexSafely(auditLogs, { entity: 1, entity_id: 1, created_at: -1 }),
      createIndexSafely(users, { phone_normalized: 1 }, { unique: true, sparse: true, name: "users_phone_normalized_unique" }),
      createIndexSafely(users, { bootstrap_key: 1 }, { unique: true, sparse: true, name: "users_first_bootstrap_unique" }),
      createIndexSafely(users, { role: 1, active: 1, approved: 1 }, { name: "users_technician_lookup" }),
      createIndexSafely(pushSubscriptions, { endpoint: 1 }, { unique: true }),
      createIndexSafely(videoChunks, { upload_id: 1, index: 1 }, { name: "video_chunks_upload_index" }),
      createIndexSafely(videoChunks, { upload_id: 1, owner_id: 1, index: 1 }, { name: "video_chunks_owner_upload_index" }),
      createIndexSafely(videoChunks, { at: 1 }, { expireAfterSeconds: 24 * 60 * 60, name: "video_chunks_at_ttl" }),
    ]).then(() => undefined);
  }

  return global._agmIndexPromise;
}
